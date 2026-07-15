import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import {
  ok,
  err,
  fromAsyncThrowable,
  NodeIdSchema,
  EdgeIdSchema,
  TypeIdSchema,
  DeviceIdSchema,
  InstantSchema,
  PropertyMapSchema,
  asEventId,
} from '@canopy/graph';

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

export interface CanopyConfig {
  readonly version: 1;
  readonly graphId: string;
  readonly name: string;
}

export const FileStoreManifestSchema = z.object({
  sealed: z.array(z.string()),
  lastEventId: z.string().nullable(),
});

export interface FileStoreManifest {
  readonly sealed: readonly string[];
  readonly lastEventId: string | null;
}

const EventIdSchema = z.string().uuid().transform(asEventId);

export const GraphEventSchema: z.ZodType<GraphEvent, unknown> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('NodeCreated'),
    eventId: EventIdSchema,
    id: NodeIdSchema,
    nodeType: TypeIdSchema,
    properties: PropertyMapSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
    migrationId: z.string().optional(),
  }),
  z.object({
    type: z.literal('NodePropertiesUpdated'),
    eventId: EventIdSchema,
    id: NodeIdSchema,
    changes: PropertyMapSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
    migrationId: z.string().optional(),
  }),
  z.object({
    type: z.literal('NodeDeleted'),
    eventId: EventIdSchema,
    id: NodeIdSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
    migrationId: z.string().optional(),
  }),
  z.object({
    type: z.literal('EdgeCreated'),
    eventId: EventIdSchema,
    id: EdgeIdSchema,
    edgeType: TypeIdSchema,
    source: NodeIdSchema,
    target: NodeIdSchema,
    properties: PropertyMapSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
    migrationId: z.string().optional(),
  }),
  z.object({
    type: z.literal('EdgePropertiesUpdated'),
    eventId: EventIdSchema,
    id: EdgeIdSchema,
    changes: PropertyMapSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
    migrationId: z.string().optional(),
  }),
  z.object({
    type: z.literal('EdgeDeleted'),
    eventId: EventIdSchema,
    id: EdgeIdSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
    migrationId: z.string().optional(),
  }),
  z.object({
    type: z.literal('WorkflowStarted'),
    eventId: EventIdSchema,
    workflowId: NodeIdSchema,
    triggerId: NodeIdSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
  }),
  z.object({
    type: z.literal('WorkflowCompleted'),
    eventId: EventIdSchema,
    executionId: EventIdSchema,
    timestamp: InstantSchema,
    deviceId: DeviceIdSchema,
    batchId: z.string().optional(),
  }),
]);

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
  // eslint-disable-next-line unicorn/no-array-reduce
  return events.reduce<readonly EventGroup[]>((acc, event) => {
    if (event.batchId === undefined) {
      return [...acc, { batchId: undefined, events: [event] }];
    }
    const lastGroup = acc.at(-1);
    if (lastGroup !== undefined && lastGroup.batchId === event.batchId) {
      const updatedGroup: EventGroup = {
        batchId: event.batchId,
        events: [...lastGroup.events, event],
      };
      return [...acc.slice(0, -1), updatedGroup];
    }
    return [...acc, { batchId: event.batchId, events: [event] }];
  }, []);
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

const filterUniqueEvents = async (
  events: readonly GraphEvent[],
  manifest: FileStoreManifest,
  activeSegmentTemp: string | null,
  readSegmentEvents: (filename: string) => Promise<readonly GraphEvent[]>,
): Promise<readonly GraphEvent[]> => {
  const sealedSegmentsEventsPromises = manifest.sealed.map(readSegmentEvents);
  const sealedEventsLists = await Promise.all(sealedSegmentsEventsPromises);
  const sealedEvents = sealedEventsLists.flat();
  const activeEventsLoaded =
    activeSegmentTemp === null ? [] : await readSegmentEvents(activeSegmentTemp);

  const existingEventIds = new Set([
    ...sealedEvents.map((e) => e.eventId),
    ...activeEventsLoaded.map((e) => e.eventId),
  ]);

  return events.filter((e) => !existingEventIds.has(e.eventId));
};

interface ProcessConfig {
  readonly maxEventsPerSegment: number;
  readonly maxBytesPerSegment: number;
  readonly deviceDir: string;
}

const processEventGroups = async (
  groups: readonly EventGroup[],
  manifest: FileStoreManifest,
  activeSegment: string | null,
  activeEvents: readonly GraphEvent[],
  config: ProcessConfig,
): Promise<FileStoreManifest> => {
  const { maxEventsPerSegment, maxBytesPerSegment, deviceDir } = config;
  let currentManifest = manifest;
  let currentActiveSegment = activeSegment;
  let currentActiveEvents = activeEvents;

  let nActive = currentActiveEvents.length;
  let sActive =
    currentActiveEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n').length +
    (nActive > 0 ? 1 : 0);

  // eslint-disable-next-line functional/no-loop-statements
  for (const group of groups) {
    const groupJsonl = group.events.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
    const nGroup = group.events.length;
    const sGroup = groupJsonl.length;

    if (
      nActive > 0 &&
      (nActive + nGroup > maxEventsPerSegment || sActive + sGroup > maxBytesPerSegment)
    ) {
      currentManifest =
        currentActiveSegment === null
          ? currentManifest
          : {
              ...currentManifest,
              sealed: [...currentManifest.sealed, currentActiveSegment],
            };
      currentActiveSegment = null;
      currentActiveEvents = [];
    }

    if (currentActiveSegment === null) {
      const firstEvent = group.events[0];
      if (!firstEvent) {
        throw new Error('Group events list is empty');
      }
      currentActiveSegment = `${firstEvent.eventId}.jsonl`;
      currentActiveEvents = [...group.events];
    } else {
      currentActiveEvents = [...currentActiveEvents, ...group.events];
    }

    const segmentPath = path.join(deviceDir, currentActiveSegment);
    const fullJsonl =
      currentActiveEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
    await writeAtomically(segmentPath, fullJsonl);

    nActive = currentActiveEvents.length;
    sActive = fullJsonl.length;

    const lastEvent = group.events.at(-1);
    if (!lastEvent) {
      throw new Error('Group events list is empty');
    }
    currentManifest = {
      ...currentManifest,
      lastEventId: lastEvent.eventId,
    };

    if (nActive >= maxEventsPerSegment || sActive >= maxBytesPerSegment) {
      currentManifest = {
        ...currentManifest,
        sealed: [...currentManifest.sealed, currentActiveSegment],
      };
      currentActiveSegment = null;
      currentActiveEvents = [];
      nActive = 0;
      sActive = 0;
    }
  }

  return currentManifest;
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
        const manifest = await loadManifest();
        const activeSegmentTemp = await getActiveSegmentBasename(manifest);

        const uniqueIncomingEvents = await filterUniqueEvents(
          events,
          manifest,
          activeSegmentTemp,
          readSegmentEvents,
        );
        if (uniqueIncomingEvents.length === 0) {
          return;
        }

        if (initializedGraphId === null) {
          const canopyConfig = { version: 1 as const, graphId, name: graphId };
          await writeAtomically(canopyJsonPath, JSON.stringify(canopyConfig, null, 2));
          initializedGraphId = graphId;
        }

        const groups = groupEventsByBatch(uniqueIncomingEvents);
        const activeEventsLoaded =
          activeSegmentTemp === null ? [] : await readSegmentEvents(activeSegmentTemp);

        const finalManifest = await processEventGroups(
          groups,
          manifest,
          activeSegmentTemp,
          activeEventsLoaded,
          { maxEventsPerSegment, maxBytesPerSegment, deviceDir },
        );

        await writeAtomically(manifestPath, JSON.stringify(finalManifest, null, 2));
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

        return applyQueryOptions(uniqueEvents, options);
      });
    },
  };
};
