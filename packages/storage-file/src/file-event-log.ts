import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import { ok, err, fromAsyncThrowable, GraphEventSchema } from '@canopy/graph';

export interface FileEventLogConfig {
  readonly rootDir: string;
  readonly deviceId: string;
  readonly maxEventsPerSegment?: number;
  readonly maxBytesPerSegment?: number;
}

export interface FileEventLog extends EventLogStore {
  readonly init: () => Promise<Result<void, Error>>;
  readonly close: () => Promise<Result<void, Error>>;
  readonly reconcile: (graphId: string) => Promise<Result<void, Error>>;
}

const CanopyConfigSchema = z.object({
  version: z.literal(1),
  graphId: z.string(),
  name: z.string(),
});

const FileStoreManifestSchema = z.object({
  sealed: z.array(z.string()),
  lastEventId: z.string().nullable(),
  watermarks: z.record(z.string(), z.string()).default({}),
});

export interface FileStoreManifest {
  readonly sealed: readonly string[];
  readonly lastEventId: string | null;
  readonly watermarks: Readonly<Record<string, string>>;
}

interface StorageConfig {
  readonly rootDirectory: string;
  readonly deviceId: string;
  readonly deviceDirectory: string;
  readonly canopyJsonPath: string;
  readonly manifestPath: string;
  readonly maxEventsPerSegment: number;
  readonly maxBytesPerSegment: number;
}

const createStorageConfig = (config: FileEventLogConfig): StorageConfig => {
  const {
    rootDir: rootDirectory,
    deviceId,
    maxEventsPerSegment = 1000,
    maxBytesPerSegment = 1024 * 1024,
  } = config;

  const deviceDirectory = path.join(rootDirectory, 'events', deviceId);
  const canopyJsonPath = path.join(rootDirectory, 'canopy.json');
  const manifestPath = path.join(deviceDirectory, 'manifest.json');

  return {
    rootDirectory,
    deviceId,
    deviceDirectory,
    canopyJsonPath,
    manifestPath,
    maxEventsPerSegment,
    maxBytesPerSegment,
  };
};

const serializeEvent = (event: GraphEvent): unknown => {
  switch (event.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      return {
        ...event,
        properties: Object.fromEntries(event.properties),
      };
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      return {
        ...event,
        changes: Object.fromEntries(event.changes),
      };
    }
    case 'NodeDeleted':
    case 'EdgeDeleted':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return event;
    }
  }
};

const deserializeEvent = (storable: unknown): GraphEvent => {
  return GraphEventSchema.parse(storable);
};

interface EventGroup {
  readonly batchId: string | undefined;
  readonly events: readonly GraphEvent[];
}

const groupEventsByBatch = (events: readonly GraphEvent[]): readonly EventGroup[] => {
  const step = (
    index: number,
    groups: readonly EventGroup[],
    currentGroup: readonly GraphEvent[],
    currentBatchId: string | undefined,
  ): readonly EventGroup[] => {
    if (index >= events.length) {
      return currentGroup.length > 0
        ? [...groups, { batchId: currentBatchId, events: currentGroup }]
        : groups;
    }

    const event = events[index];
    if (event === undefined) {
      return step(index + 1, groups, currentGroup, currentBatchId);
    }

    if (event.batchId === undefined) {
      const flushedGroups =
        currentGroup.length > 0
          ? [...groups, { batchId: currentBatchId, events: currentGroup }]
          : groups;
      return step(
        index + 1,
        [...flushedGroups, { batchId: undefined, events: [event] }],
        [],
        undefined,
      );
    }

    if (event.batchId === currentBatchId) {
      return step(index + 1, groups, [...currentGroup, event], currentBatchId);
    }

    const flushedGroups =
      currentGroup.length > 0
        ? [...groups, { batchId: currentBatchId, events: currentGroup }]
        : groups;

    return step(index + 1, flushedGroups, [event], event.batchId);
  };

  return step(0, [], [], undefined);
};

const applyQueryOptions = (
  events: readonly GraphEvent[],
  options: EventLogQueryOptions,
): readonly GraphEvent[] => {
  const { after, before, reverse, limit } = options;
  const filteredAfter = after ? events.filter((event) => event.eventId > after) : events;
  const filteredBefore = before
    ? filteredAfter.filter((event) => event.eventId < before)
    : filteredAfter;
  const reversed = reverse ? filteredBefore.toReversed() : filteredBefore;
  return limit !== undefined && limit >= 0 ? reversed.slice(0, limit) : reversed;
};

const writeAtomically = async (filePath: string, content: string): Promise<void> => {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, content, 'utf8');
  await fs.rename(temporaryPath, filePath);
};

interface AppendWritesResult {
  readonly manifest: FileStoreManifest;
  readonly filesToWrite: ReadonlyMap<string, string>;
}

interface AppendWritesState {
  readonly manifest: FileStoreManifest;
  readonly activeSegment: string | null;
  readonly activeEvents: readonly GraphEvent[];
  readonly filesToWrite: ReadonlyMap<string, string>;
}

const formatEventsJsonl = (events: readonly GraphEvent[]): string =>
  events.map((event_) => JSON.stringify(serializeEvent(event_))).join('\n') + '\n';

const sealActiveSegmentIfNeeded = (
  state: AppendWritesState,
  groupEventsLength: number,
  groupJsonlLength: number,
  maxEventsPerSegment: number,
  maxBytesPerSegment: number,
  deviceDirectory: string,
): AppendWritesState => {
  const activeEventsCount = state.activeEvents.length;
  const activeJsonlLength = formatEventsJsonl(state.activeEvents).length;

  const shouldSeal =
    activeEventsCount > 0 &&
    (activeEventsCount + groupEventsLength > maxEventsPerSegment ||
      activeJsonlLength + groupJsonlLength > maxBytesPerSegment);

  if (!shouldSeal || state.activeSegment === null) {
    return state;
  }

  const sealedJsonl = formatEventsJsonl(state.activeEvents);
  return {
    manifest: {
      ...state.manifest,
      sealed: [...state.manifest.sealed, state.activeSegment],
    },
    activeSegment: null,
    activeEvents: [],
    filesToWrite: new Map([
      ...state.filesToWrite,
      [path.join(deviceDirectory, state.activeSegment), sealedJsonl],
    ]),
  };
};

const processAppendGroup = (
  state: AppendWritesState,
  group: EventGroup,
  config: {
    readonly maxEventsPerSegment: number;
    readonly maxBytesPerSegment: number;
    readonly deviceDirectory: string;
  },
): AppendWritesState => {
  if (group.events.length === 0) {
    return state;
  }

  const groupJsonl = formatEventsJsonl(group.events);
  const stateAfterSeal = sealActiveSegmentIfNeeded(
    state,
    group.events.length,
    groupJsonl.length,
    config.maxEventsPerSegment,
    config.maxBytesPerSegment,
    config.deviceDirectory,
  );

  const firstEvent = group.events[0];
  const lastEvent = group.events.at(-1);
  if (firstEvent === undefined || lastEvent === undefined) {
    return stateAfterSeal;
  }

  const nextActiveSegment =
    stateAfterSeal.activeSegment === null
      ? `${firstEvent.eventId}.jsonl`
      : stateAfterSeal.activeSegment;
  const nextActiveEvents = [...stateAfterSeal.activeEvents, ...group.events];
  const nextManifest: FileStoreManifest = {
    ...stateAfterSeal.manifest,
    lastEventId: lastEvent.eventId,
  };

  const fullJsonl = formatEventsJsonl(nextActiveEvents);
  const currentCount = nextActiveEvents.length;
  const currentBytes = fullJsonl.length;

  const shouldSealAfter =
    currentCount >= config.maxEventsPerSegment || currentBytes >= config.maxBytesPerSegment;

  if (shouldSealAfter) {
    return {
      manifest: {
        ...nextManifest,
        sealed: [...nextManifest.sealed, nextActiveSegment],
      },
      activeSegment: null,
      activeEvents: [],
      filesToWrite: new Map([
        ...stateAfterSeal.filesToWrite,
        [path.join(config.deviceDirectory, nextActiveSegment), fullJsonl],
      ]),
    };
  }

  return {
    manifest: nextManifest,
    activeSegment: nextActiveSegment,
    activeEvents: nextActiveEvents,
    filesToWrite: stateAfterSeal.filesToWrite,
  };
};

const buildAppendWrites = (
  groups: readonly EventGroup[],
  manifest: FileStoreManifest,
  activeSegment: string | null,
  activeEvents: readonly GraphEvent[],
  config: {
    readonly maxEventsPerSegment: number;
    readonly maxBytesPerSegment: number;
    readonly deviceDirectory: string;
  },
): AppendWritesResult => {
  const initialState: AppendWritesState = {
    manifest,
    activeSegment,
    activeEvents,
    filesToWrite: new Map<string, string>(),
  };

  const processAllGroups = (index: number, currentState: AppendWritesState): AppendWritesState => {
    if (index >= groups.length) {
      return currentState;
    }
    const currentGroup = groups[index];
    const nextState =
      currentGroup === undefined
        ? currentState
        : processAppendGroup(currentState, currentGroup, config);
    return processAllGroups(index + 1, nextState);
  };

  const finalState = processAllGroups(0, initialState);

  if (finalState.activeSegment !== null) {
    const fullJsonl = formatEventsJsonl(finalState.activeEvents);
    return {
      manifest: finalState.manifest,
      filesToWrite: new Map([
        ...finalState.filesToWrite,
        [path.join(config.deviceDirectory, finalState.activeSegment), fullJsonl],
      ]),
    };
  }

  return {
    manifest: finalState.manifest,
    filesToWrite: finalState.filesToWrite,
  };
};

const readManifest = async (manifestPath: string): Promise<Result<FileStoreManifest, Error>> => {
  const result = await fromAsyncThrowable(async () => {
    const content = await fs.readFile(manifestPath, 'utf8');
    const parsed = FileStoreManifestSchema.parse(JSON.parse(content));
    return {
      sealed: parsed.sealed,
      lastEventId: parsed.lastEventId,
      watermarks: parsed.watermarks,
    };
  });
  if (!result.ok && 'code' in result.error && result.error.code === 'ENOENT') {
    return ok({
      sealed: [],
      lastEventId: null,
      watermarks: {},
    });
  }
  return result;
};

const getActiveSegmentBasename = async (
  deviceDirectory: string,
  manifest: FileStoreManifest,
): Promise<string | null> => {
  const result = await fromAsyncThrowable(async () => {
    const files = await fs.readdir(deviceDirectory);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    const activeFiles = jsonlFiles.filter((f) => !manifest.sealed.includes(f));
    if (activeFiles.length === 0) {
      return null;
    }
    const sorted = activeFiles.toSorted((a, b) => a.localeCompare(b));
    return sorted.at(-1) ?? null;
  });
  return result.ok ? result.value : null;
};

const readSegmentEvents = async (
  deviceDirectory: string,
  segmentFilename: string,
): Promise<readonly GraphEvent[]> => {
  const filePath = path.join(deviceDirectory, segmentFilename);
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');
  return lines.map((line) => deserializeEvent(JSON.parse(line)));
};

const readCanopyConfigGraphId = async (canopyJsonPath: string): Promise<string | null> => {
  const result = await fromAsyncThrowable(async () => {
    const content = await fs.readFile(canopyJsonPath, 'utf8');
    const parsed = CanopyConfigSchema.parse(JSON.parse(content));
    return parsed.graphId;
  });
  return result.ok ? result.value : null;
};

const loadCache = async (
  deviceDirectory: string,
  manifestPath: string,
): Promise<readonly string[]> => {
  const manifestResult = await readManifest(manifestPath);
  const manifest = manifestResult.ok
    ? manifestResult.value
    : { sealed: [], lastEventId: null, watermarks: {} };
  const activeSegment = await getActiveSegmentBasename(deviceDirectory, manifest);

  const segmentsToRead =
    activeSegment === null ? manifest.sealed : [...manifest.sealed, activeSegment];

  const segmentEventsLists = await Promise.all(
    segmentsToRead.map((segment) => readSegmentEvents(deviceDirectory, segment)),
  );

  return segmentEventsLists.flat().map((event_) => event_.eventId);
};

const initializeStoreDirectory = async (
  deviceDirectory: string,
  canopyJsonPath: string,
): Promise<string | null> => {
  await fs.mkdir(deviceDirectory, { recursive: true });
  return readCanopyConfigGraphId(canopyJsonPath);
};

const ensureCanopyConfigWritten = async (
  canopyJsonPath: string,
  graphId: string,
): Promise<void> => {
  const canopyConfig = { version: 1 as const, graphId, name: graphId };
  await writeAtomically(canopyJsonPath, JSON.stringify(canopyConfig, null, 2));
};

const appendEventsToDisk = async (
  config: StorageConfig,
  events: readonly GraphEvent[],
): Promise<Result<void, Error>> => {
  const manifestResult = await readManifest(config.manifestPath);
  const manifest = manifestResult.ok
    ? manifestResult.value
    : { sealed: [], lastEventId: null, watermarks: {} };
  const activeSegment = await getActiveSegmentBasename(config.deviceDirectory, manifest);
  const activeEvents =
    activeSegment === null ? [] : await readSegmentEvents(config.deviceDirectory, activeSegment);

  const groups = groupEventsByBatch(events);
  const { manifest: updatedManifest, filesToWrite } = buildAppendWrites(
    groups,
    manifest,
    activeSegment,
    activeEvents,
    {
      maxEventsPerSegment: config.maxEventsPerSegment,
      maxBytesPerSegment: config.maxBytesPerSegment,
      deviceDirectory: config.deviceDirectory,
    },
  );

  const allFilesToWrite: readonly (readonly [string, string])[] = [
    ...filesToWrite,
    [config.manifestPath, JSON.stringify(updatedManifest, null, 2)],
  ];

  await Promise.all(
    allFilesToWrite.map(([filePath, content]) => writeAtomically(filePath, content)),
  );

  return ok(undefined);
};

const readAllEventsFromDisk = async (
  deviceDirectory: string,
  manifestPath: string,
): Promise<Result<readonly GraphEvent[], Error>> => {
  const manifestResult = await readManifest(manifestPath);
  const manifest = manifestResult.ok
    ? manifestResult.value
    : { sealed: [], lastEventId: null, watermarks: {} };
  const activeSegment = await getActiveSegmentBasename(deviceDirectory, manifest);

  const sealedEventsLists = await Promise.all(
    manifest.sealed.map((segment) => readSegmentEvents(deviceDirectory, segment)),
  );
  const sealedEvents = sealedEventsLists.flat();

  const activeEvents =
    activeSegment === null ? [] : await readSegmentEvents(deviceDirectory, activeSegment);
  const allEvents = [...sealedEvents, ...activeEvents];
  const sortedEvents = allEvents.toSorted((a, b) => a.eventId.localeCompare(b.eventId));
  const uniqueEvents = sortedEvents.filter(
    (event, index, self) => index === 0 || event.eventId !== self[index - 1]?.eventId,
  );

  return ok(uniqueEvents);
};

interface RemoteDeviceSyncResult {
  readonly remoteDeviceId: string;
  readonly updatedWatermark: string | null;
  readonly eventsToAppend: readonly GraphEvent[];
}

const syncRemoteDevice = async (
  rootDirectory: string,
  remoteDeviceId: string,
  remoteManifest: FileStoreManifest,
  currentWatermark: string | null,
): Promise<Result<RemoteDeviceSyncResult, Error>> => {
  if (remoteManifest.lastEventId === currentWatermark) {
    return ok({
      remoteDeviceId,
      updatedWatermark: null,
      eventsToAppend: [],
    });
  }

  const remoteDeviceDirectory = path.join(rootDirectory, 'events', remoteDeviceId);
  const segmentsResult = await getRemoteSegmentsInOrder(remoteDeviceDirectory);
  if (!segmentsResult.ok) {
    return segmentsResult;
  }

  const segmentEventsResults = await Promise.all(
    segmentsResult.value.map((segment) => readRemoteSegmentEvents(remoteDeviceDirectory, segment)),
  );

  const errorResult = segmentEventsResults.find((r) => !r.ok);
  if (errorResult && !errorResult.ok) {
    return errorResult;
  }

  const allRawEvents = segmentEventsResults.flatMap((r) => (r.ok ? r.value : []));
  const newEvents = allRawEvents
    .map((event_) => GraphEventSchema.parse(event_))
    .filter((event_) => currentWatermark === null || event_.eventId > currentWatermark);

  return ok({
    remoteDeviceId,
    updatedWatermark: remoteManifest.lastEventId,
    eventsToAppend: newEvents,
  });
};

const appendSequentialRemoteEvents = async (
  items: readonly RemoteDeviceSyncResult[],
  appendBatch: (events: readonly GraphEvent[]) => Promise<Result<void, Error>>,
): Promise<Result<void, Error>> => {
  const appendIndex = async (index: number): Promise<Result<void, Error>> => {
    if (index >= items.length) {
      return ok(undefined);
    }
    const currentItem = items[index];
    if (currentItem === undefined || currentItem.eventsToAppend.length === 0) {
      return appendIndex(index + 1);
    }
    const sorted = currentItem.eventsToAppend.toSorted((a, b) =>
      a.eventId.localeCompare(b.eventId),
    );
    const result = await appendBatch(sorted);
    if (!result.ok) {
      return result;
    }
    return appendIndex(index + 1);
  };
  return appendIndex(0);
};

const mergeWatermarks = (
  initialWatermarks: Readonly<Record<string, string>>,
  updates: readonly (readonly [string, string])[],
): Readonly<Record<string, string>> => {
  const applyNext = (
    index: number,
    currentWatermarks: Readonly<Record<string, string>>,
  ): Readonly<Record<string, string>> => {
    if (index >= updates.length) {
      return currentWatermarks;
    }
    const update = updates[index];
    if (update === undefined) {
      return applyNext(index + 1, currentWatermarks);
    }
    const [deviceId, watermark] = update;
    return applyNext(index + 1, { ...currentWatermarks, [deviceId]: watermark });
  };
  return applyNext(0, initialWatermarks);
};

const reconcileRemoteManifests = async (
  config: StorageConfig,
  graphId: string,
  appendEventsBatch: (
    targetGraphId: string,
    events: readonly GraphEvent[],
  ) => Promise<Result<void, Error>>,
): Promise<Result<void, Error>> => {
  const localManifestResult = await readManifest(config.manifestPath);
  if (!localManifestResult.ok) {
    return localManifestResult;
  }
  const localManifest = localManifestResult.value;

  const remoteManifestsResult = await scanRemoteManifests(config.rootDirectory, config.deviceId);
  if (!remoteManifestsResult.ok) {
    return remoteManifestsResult;
  }
  const remoteManifests = remoteManifestsResult.value;

  const syncPromises = [...remoteManifests].map(([remoteDeviceId, remoteManifest]) => {
    const watermark = localManifest.watermarks[remoteDeviceId] ?? null;
    return syncRemoteDevice(config.rootDirectory, remoteDeviceId, remoteManifest, watermark);
  });

  const syncResults = await Promise.all(syncPromises);
  const syncError = syncResults.find((r) => !r.ok);
  if (syncError && !syncError.ok) {
    return syncError;
  }

  const syncData = syncResults.flatMap((r) => (r.ok ? [r.value] : []));

  const appendResult = await appendSequentialRemoteEvents(syncData, (eventsToAppend) =>
    appendEventsBatch(graphId, eventsToAppend),
  );

  if (!appendResult.ok) {
    return appendResult;
  }

  const watermarkUpdates = syncData
    .filter((item) => item.updatedWatermark !== null)
    .map((item) => [item.remoteDeviceId, item.updatedWatermark as string] as const);

  if (watermarkUpdates.length > 0) {
    const currentManifestResult = await readManifest(config.manifestPath);
    if (!currentManifestResult.ok) {
      return currentManifestResult;
    }
    const updatedWatermarks = mergeWatermarks(
      currentManifestResult.value.watermarks,
      watermarkUpdates,
    );
    const finalManifest: FileStoreManifest = {
      ...currentManifestResult.value,
      watermarks: updatedWatermarks,
    };
    await writeAtomically(config.manifestPath, JSON.stringify(finalManifest, null, 2));
  }

  return ok(undefined);
};

interface AppendEventsContext {
  readonly storageConfig: StorageConfig;
  readonly state: {
    readonly initializedGraphId: string | null;
    readonly knownEventIds: ReadonlySet<string>;
  };
  readonly ensureCacheLoaded: () => Promise<void>;
  readonly setInitializedGraphId: (id: string) => void;
  readonly updateKnownEventIds: (events: readonly GraphEvent[]) => void;
}

const executeAppendEvents = async (
  context: AppendEventsContext,
  graphId: string,
  events: readonly GraphEvent[],
): Promise<Result<void, Error>> => {
  const { storageConfig, state, ensureCacheLoaded, setInitializedGraphId, updateKnownEventIds } =
    context;

  if (state.initializedGraphId !== null && graphId !== state.initializedGraphId) {
    return err(
      new Error(`Graph ID mismatch: expected ${state.initializedGraphId}, got ${graphId}`),
    );
  }

  return fromAsyncThrowable(async () => {
    await ensureCacheLoaded();
    const uniqueIncomingEvents = events.filter(
      (event_) => !state.knownEventIds.has(event_.eventId),
    );
    if (uniqueIncomingEvents.length === 0) {
      return;
    }

    if (state.initializedGraphId === null) {
      await ensureCanopyConfigWritten(storageConfig.canopyJsonPath, graphId);
      setInitializedGraphId(graphId);
    }

    const appendResult = await appendEventsToDisk(storageConfig, uniqueIncomingEvents);
    if (!appendResult.ok) {
      throw appendResult.error;
    }

    updateKnownEventIds(uniqueIncomingEvents);
  });
};

const executeGetEvents = async (
  storageConfig: StorageConfig,
  graphId: string,
  options: EventLogQueryOptions,
  initializedGraphId: string | null,
  updateKnownEventIds: (events: readonly GraphEvent[]) => void,
  setCacheLoaded: () => void,
): Promise<Result<readonly GraphEvent[], Error>> => {
  if (initializedGraphId !== null && graphId !== initializedGraphId) {
    return err(new Error(`Graph ID mismatch: expected ${initializedGraphId}, got ${graphId}`));
  }

  return fromAsyncThrowable(async () => {
    const eventsResult = await readAllEventsFromDisk(
      storageConfig.deviceDirectory,
      storageConfig.manifestPath,
    );
    if (!eventsResult.ok) {
      throw eventsResult.error;
    }
    const uniqueEvents = eventsResult.value;
    updateKnownEventIds(uniqueEvents);
    setCacheLoaded();

    return applyQueryOptions(uniqueEvents, options);
  });
};

const executeInitStore = async (
  deviceDirectory: string,
  canopyJsonPath: string,
  isInitialized: boolean,
  onInitialized: (graphId: string | null) => void,
): Promise<Result<void, Error>> => {
  if (isInitialized) return ok(undefined);
  return fromAsyncThrowable(async () => {
    const graphId = await initializeStoreDirectory(deviceDirectory, canopyJsonPath);
    onInitialized(graphId);
  });
};

export const createFileEventLog = (config: FileEventLogConfig): FileEventLog => {
  const storageConfig = createStorageConfig(config);

  let initializedGraphId: string | null = null;
  let isInitialized = false;
  let cacheLoaded = false;
  let knownEventIds: ReadonlySet<string> = new Set<string>();

  const ensureCacheLoaded = async (): Promise<void> => {
    if (cacheLoaded) {
      return;
    }
    const loadedIds = await loadCache(storageConfig.deviceDirectory, storageConfig.manifestPath);
    knownEventIds = new Set([...knownEventIds, ...loadedIds]);
    cacheLoaded = true;
  };

  const updateKnownEventIds = (events: readonly GraphEvent[]): void => {
    knownEventIds = new Set([...knownEventIds, ...events.map((event_) => event_.eventId)]);
  };

  const store: FileEventLog = {
    init: async (): Promise<Result<void, Error>> =>
      executeInitStore(
        storageConfig.deviceDirectory,
        storageConfig.canopyJsonPath,
        isInitialized,
        (graphId) => {
          if (graphId !== null) {
            initializedGraphId = graphId;
          }
          isInitialized = true;
        },
      ),

    close: async (): Promise<Result<void, Error>> => ok(undefined),

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!isInitialized) return err(new Error('Store not initialized'));
      if (events.length === 0) return ok(undefined);

      return executeAppendEvents(
        {
          storageConfig,
          state: { initializedGraphId, knownEventIds },
          ensureCacheLoaded,
          setInitializedGraphId: (id) => {
            initializedGraphId = id;
          },
          updateKnownEventIds,
        },
        graphId,
        events,
      );
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!isInitialized) return err(new Error('Store not initialized'));

      return executeGetEvents(
        storageConfig,
        graphId,
        options,
        initializedGraphId,
        updateKnownEventIds,
        () => {
          cacheLoaded = true;
        },
      );
    },

    reconcile: async (graphId: string): Promise<Result<void, Error>> => {
      if (!isInitialized) return err(new Error('Store not initialized'));

      if (initializedGraphId !== null && graphId !== initializedGraphId) {
        return err(new Error(`Graph ID mismatch: expected ${initializedGraphId}, got ${graphId}`));
      }

      await ensureCacheLoaded();
      return reconcileRemoteManifests(storageConfig, graphId, store.appendEvents);
    },
  };

  return store;
};

export const scanRemoteManifests = async (
  rootDirectory: string,
  localDeviceId: string,
): Promise<Result<ReadonlyMap<string, FileStoreManifest>, Error>> => {
  const eventsDirectory = path.join(rootDirectory, 'events');
  const entriesResult = await fromAsyncThrowable(() =>
    fs.readdir(eventsDirectory, { withFileTypes: true }),
  );
  if (!entriesResult.ok) {
    if ('code' in entriesResult.error && entriesResult.error.code === 'ENOENT') {
      return ok(new Map<string, FileStoreManifest>());
    }
    return entriesResult;
  }

  const directoryNames = entriesResult.value
    .filter((entry) => entry.isDirectory() && entry.name !== localDeviceId)
    .map((entry) => entry.name);

  const manifestPromises = directoryNames.map(async (remoteDeviceId) => {
    const remoteManifestPath = path.join(eventsDirectory, remoteDeviceId, 'manifest.json');
    const manifestResult = await fromAsyncThrowable(async () => {
      const content = await fs.readFile(remoteManifestPath, 'utf8');
      const parsed = FileStoreManifestSchema.parse(JSON.parse(content));
      const manifest: FileStoreManifest = {
        sealed: parsed.sealed,
        lastEventId: parsed.lastEventId,
        watermarks: parsed.watermarks,
      };
      return [remoteDeviceId, manifest] as const;
    });
    return manifestResult.ok ? manifestResult.value : null;
  });

  const manifestResults = await Promise.all(manifestPromises);
  const validResults = manifestResults.filter(
    (r): r is readonly [string, FileStoreManifest] => r !== null,
  );
  return ok(new Map(validResults));
};

export const getRemoteSegmentsInOrder = async (
  remoteDeviceDirectory: string,
): Promise<Result<readonly string[], Error>> => {
  const result = await fromAsyncThrowable(async () => {
    const files = await fs.readdir(remoteDeviceDirectory);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
    return jsonlFiles.toSorted((a, b) => a.localeCompare(b));
  });
  if (!result.ok && 'code' in result.error && result.error.code === 'ENOENT') {
    return ok([]);
  }
  return result;
};

export const readRemoteSegmentEvents = async (
  remoteDeviceDirectory: string,
  segmentFilename: string,
): Promise<Result<readonly GraphEvent[], Error>> => {
  return fromAsyncThrowable(async () => {
    const filePath = path.join(remoteDeviceDirectory, segmentFilename);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    return lines.map((line) => deserializeEvent(JSON.parse(line)));
  });
};
