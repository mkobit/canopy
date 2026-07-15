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
}

export const CanopyConfigSchema = z.object({
  version: z.literal(1),
  graphId: z.string(),
  name: z.string(),
});

export type CanopyConfig = z.infer<typeof CanopyConfigSchema>;

export const FileStoreManifestSchema = z.object({
  sealed: z.array(z.string()),
  lastEventId: z.string().nullable(),
});

export interface FileStoreManifest {
  readonly sealed: readonly string[];
  readonly lastEventId: string | null;
}

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
  let groups: readonly EventGroup[] = [];
  let currentGroup: readonly GraphEvent[] = [];
  let currentBatchId: string | undefined = undefined;

  // eslint-disable-next-line functional/no-loop-statements
  for (const event of events) {
    if (event.batchId === undefined) {
      if (currentGroup.length > 0) {
        groups = [...groups, { batchId: currentBatchId, events: currentGroup }];
        currentGroup = [];
        currentBatchId = undefined;
      }
      groups = [...groups, { batchId: undefined, events: [event] }];
    } else if (event.batchId === currentBatchId) {
      currentGroup = [...currentGroup, event];
    } else {
      if (currentGroup.length > 0) {
        groups = [...groups, { batchId: currentBatchId, events: currentGroup }];
      }
      currentGroup = [event];
      currentBatchId = event.batchId;
    }
  }

  if (currentGroup.length > 0) {
    groups = [...groups, { batchId: currentBatchId, events: currentGroup }];
  }

  return groups;
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
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, content, 'utf8');
  await fs.rename(tmpPath, filePath);
};

interface AppendWritesResult {
  readonly manifest: FileStoreManifest;
  readonly filesToWrite: ReadonlyMap<string, string>;
}

const buildAppendWrites = (
  groups: readonly EventGroup[],
  manifest: FileStoreManifest,
  activeSegment: string | null,
  activeEvents: readonly GraphEvent[],
  config: {
    readonly maxEventsPerSegment: number;
    readonly maxBytesPerSegment: number;
    readonly deviceDir: string;
  },
): AppendWritesResult => {
  const { maxEventsPerSegment, maxBytesPerSegment, deviceDir } = config;
  let currentManifest = manifest;
  let currentActiveSegment = activeSegment;
  let currentActiveEvents = activeEvents;
  const filesToWrite = new Map<string, string>();

  // eslint-disable-next-line functional/no-loop-statements
  for (const group of groups) {
    const groupJsonl = group.events.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
    const nActive = currentActiveEvents.length;
    const sActive =
      currentActiveEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n').length +
      (nActive > 0 ? 1 : 0);
    const nGroup = group.events.length;
    const sGroup = groupJsonl.length;

    if (
      nActive > 0 &&
      (nActive + nGroup > maxEventsPerSegment || sActive + sGroup > maxBytesPerSegment)
    ) {
      if (currentActiveSegment !== null) {
        currentManifest = {
          ...currentManifest,
          sealed: [...currentManifest.sealed, currentActiveSegment],
        };
        const sealedJsonl =
          currentActiveEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
        filesToWrite.set(path.join(deviceDir, currentActiveSegment), sealedJsonl);
      }
      currentActiveSegment = null;
      currentActiveEvents = [];
    }

    if (currentActiveSegment === null) {
      const firstEvent = group.events[0];
      if (!firstEvent) {
        // eslint-disable-next-line functional/no-throw-statements
        throw new Error('Group events list is empty');
      }
      currentActiveSegment = `${firstEvent.eventId}.jsonl`;
      currentActiveEvents = [...group.events];
    } else {
      currentActiveEvents = [...currentActiveEvents, ...group.events];
    }

    const lastEvent = group.events.at(-1);
    if (!lastEvent) {
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error('Group events list is empty');
    }
    currentManifest = {
      ...currentManifest,
      lastEventId: lastEvent.eventId,
    };

    const fullJsonl =
      currentActiveEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
    const curN = currentActiveEvents.length;
    const curS = fullJsonl.length;

    if (curN >= maxEventsPerSegment || curS >= maxBytesPerSegment) {
      currentManifest = {
        ...currentManifest,
        sealed: [...currentManifest.sealed, currentActiveSegment],
      };
      filesToWrite.set(path.join(deviceDir, currentActiveSegment), fullJsonl);
      currentActiveSegment = null;
      currentActiveEvents = [];
    }
  }

  if (currentActiveSegment !== null) {
    const fullJsonl =
      currentActiveEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
    filesToWrite.set(path.join(deviceDir, currentActiveSegment), fullJsonl);
  }

  return {
    manifest: currentManifest,
    filesToWrite,
  };
};

// eslint-disable-next-line max-lines-per-function
export const createFileEventLog = (config: FileEventLogConfig): FileEventLog => {
  const {
    rootDir,
    deviceId,
    maxEventsPerSegment = 1000,
    maxBytesPerSegment = 1024 * 1024,
  } = config;

  const deviceDir = path.join(rootDir, 'events', deviceId);
  const canopyJsonPath = path.join(rootDir, 'canopy.json');
  const manifestPath = path.join(deviceDir, 'manifest.json');

  let initializedGraphId: string | null = null;
  let isInitialized = false;
  let cacheLoaded = false;
  const knownEventIds = new Set<string>();

  const loadManifest = async (): Promise<FileStoreManifest> => {
    // eslint-disable-next-line functional/no-try-statements
    try {
      const content = await fs.readFile(manifestPath, 'utf8');
      const parsed = FileStoreManifestSchema.parse(JSON.parse(content));
      return {
        sealed: parsed.sealed,
        lastEventId: parsed.lastEventId,
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return {
          sealed: [],
          lastEventId: null,
        };
      }
      throw error;
    }
  };

  const getActiveSegmentBasename = async (manifest: FileStoreManifest): Promise<string | null> => {
    // eslint-disable-next-line functional/no-try-statements
    try {
      const files = await fs.readdir(deviceDir);
      const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));
      const activeFiles = jsonlFiles.filter((f) => !manifest.sealed.includes(f));
      if (activeFiles.length === 0) {
        return null;
      }
      const sorted = activeFiles.toSorted((a, b) => a.localeCompare(b));
      return sorted.at(-1) ?? null;
    } catch {
      return null;
    }
  };

  const readSegmentEvents = async (segmentFilename: string): Promise<readonly GraphEvent[]> => {
    const filePath = path.join(deviceDir, segmentFilename);
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n').filter((line) => line.trim() !== '');
    return lines.map((line) => deserializeEvent(JSON.parse(line)));
  };

  const ensureCacheLoaded = async (): Promise<void> => {
    if (cacheLoaded) {
      return;
    }
    const manifest = await loadManifest();
    const activeSegment = await getActiveSegmentBasename(manifest);

    // eslint-disable-next-line functional/no-loop-statements
    for (const segment of manifest.sealed) {
      const segEvents = await readSegmentEvents(segment);
      // eslint-disable-next-line functional/no-loop-statements
      for (const e of segEvents) {
        knownEventIds.add(e.eventId);
      }
    }

    if (activeSegment !== null) {
      const activeList = await readSegmentEvents(activeSegment);
      // eslint-disable-next-line functional/no-loop-statements
      for (const e of activeList) {
        knownEventIds.add(e.eventId);
      }
    }

    cacheLoaded = true;
  };

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (isInitialized) return ok(undefined);
      return fromAsyncThrowable(async () => {
        await fs.mkdir(deviceDir, { recursive: true });
        // eslint-disable-next-line functional/no-try-statements
        try {
          const content = await fs.readFile(canopyJsonPath, 'utf8');
          const parsed = CanopyConfigSchema.parse(JSON.parse(content));
          initializedGraphId = parsed.graphId;
        } catch {
          // canopy.json will be written on the first appendEvents call
        }
        isInitialized = true;
        return;
      });
    },

    close: async (): Promise<Result<void, Error>> => {
      return ok(undefined);
    },

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!isInitialized) return err(new Error('Store not initialized'));
      if (events.length === 0) return ok(undefined);

      if (initializedGraphId !== null && graphId !== initializedGraphId) {
        return err(new Error(`Graph ID mismatch: expected ${initializedGraphId}, got ${graphId}`));
      }

      return fromAsyncThrowable(async () => {
        await ensureCacheLoaded();
        const uniqueIncomingEvents = events.filter((e) => !knownEventIds.has(e.eventId));
        if (uniqueIncomingEvents.length === 0) {
          return;
        }

        if (initializedGraphId === null) {
          const canopyConfig = { version: 1 as const, graphId, name: graphId };
          await writeAtomically(canopyJsonPath, JSON.stringify(canopyConfig, null, 2));
          initializedGraphId = graphId;
        }

        const manifest = await loadManifest();
        const activeSegment = await getActiveSegmentBasename(manifest);
        const activeEvents = activeSegment === null ? [] : await readSegmentEvents(activeSegment);

        const groups = groupEventsByBatch(uniqueIncomingEvents);
        const { manifest: updatedManifest, filesToWrite } = buildAppendWrites(
          groups,
          manifest,
          activeSegment,
          activeEvents,
          { maxEventsPerSegment, maxBytesPerSegment, deviceDir },
        );

        const allFilesToWrite = new Map(filesToWrite);
        allFilesToWrite.set(manifestPath, JSON.stringify(updatedManifest, null, 2));

        // eslint-disable-next-line functional/no-loop-statements
        for (const [filePath, content] of allFilesToWrite) {
          await writeAtomically(filePath, content);
        }

        // eslint-disable-next-line functional/no-loop-statements
        for (const e of uniqueIncomingEvents) {
          knownEventIds.add(e.eventId);
        }
      });
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!isInitialized) return err(new Error('Store not initialized'));

      if (initializedGraphId !== null && graphId !== initializedGraphId) {
        return err(new Error(`Graph ID mismatch: expected ${initializedGraphId}, got ${graphId}`));
      }

      return fromAsyncThrowable(async () => {
        const manifest = await loadManifest();
        const activeSegment = await getActiveSegmentBasename(manifest);

        const sealedSegmentsEventsPromises = manifest.sealed.map(readSegmentEvents);
        const sealedEventsLists = await Promise.all(sealedSegmentsEventsPromises);
        const sealedEvents = sealedEventsLists.flat();

        const activeEvents = activeSegment === null ? [] : await readSegmentEvents(activeSegment);
        const allEvents = [...sealedEvents, ...activeEvents];
        const sortedEvents = allEvents.toSorted((a, b) => a.eventId.localeCompare(b.eventId));
        const uniqueEvents = sortedEvents.filter(
          (event, index, self) => index === 0 || event.eventId !== self[index - 1]?.eventId,
        );

        // eslint-disable-next-line functional/no-loop-statements
        for (const e of uniqueEvents) {
          knownEventIds.add(e.eventId);
        }
        cacheLoaded = true;

        return applyQueryOptions(uniqueEvents, options);
      });
    },
  };
};
