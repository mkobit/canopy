import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import { ok, err, fromAsyncThrowable } from '@canopy/graph';

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
  const s = storable as Record<string, unknown>;
  const type = s.type;
  switch (type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      const props = s.properties as Record<string, unknown>;
      return {
        ...s,
        properties: new Map(Object.entries(props)),
      } as unknown as GraphEvent;
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      const changes = s.changes as Record<string, unknown>;
      return {
        ...s,
        changes: new Map(Object.entries(changes)),
      } as unknown as GraphEvent;
    }
    case 'NodeDeleted':
    case 'EdgeDeleted':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return s as unknown as GraphEvent;
    }
    default: {
      // eslint-disable-next-line functional/no-throw-statements -- unknown type is exceptional
      throw new Error(`Unknown event type: ${String(type)}`);
    }
  }
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
    } catch {
      return {
        sealed: [],
        lastEventId: null,
      };
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
    // eslint-disable-next-line functional/no-try-statements
    try {
      const filePath = path.join(deviceDir, segmentFilename);
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split('\n').filter((line) => line.trim() !== '');
      return lines.map((line) => deserializeEvent(JSON.parse(line)));
    } catch {
      return [];
    }
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
        let manifest = await loadManifest();
        const activeSegmentTemp = await getActiveSegmentBasename(manifest);

        const sealedSegmentsEventsPromises = manifest.sealed.map(readSegmentEvents);
        const sealedEventsLists = await Promise.all(sealedSegmentsEventsPromises);
        const sealedEvents = sealedEventsLists.flat();
        const activeEventsLoaded =
          activeSegmentTemp === null ? [] : await readSegmentEvents(activeSegmentTemp);

        const existingEventIds = new Set([
          ...sealedEvents.map((e) => e.eventId),
          ...activeEventsLoaded.map((e) => e.eventId),
        ]);

        const uniqueIncomingEvents = events.filter((e) => !existingEventIds.has(e.eventId));
        if (uniqueIncomingEvents.length === 0) {
          return;
        }

        if (initializedGraphId === null) {
          const canopyConfig = {
            version: 1 as const,
            graphId,
            name: graphId,
          };
          await writeAtomically(canopyJsonPath, JSON.stringify(canopyConfig, null, 2));
          initializedGraphId = graphId;
        }

        const groups = groupEventsByBatch(uniqueIncomingEvents);
        let activeSegment = activeSegmentTemp;
        let activeEvents: readonly GraphEvent[] = activeEventsLoaded;

        let nActive = activeEvents.length;
        let sActive =
          activeEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n').length +
          (activeEvents.length > 0 ? 1 : 0);

        // eslint-disable-next-line functional/no-loop-statements
        for (const group of groups) {
          const groupJsonl =
            group.events.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
          const nGroup = group.events.length;
          const sGroup = groupJsonl.length;

          if (
            nActive > 0 &&
            (nActive + nGroup > maxEventsPerSegment || sActive + sGroup > maxBytesPerSegment)
          ) {
            manifest =
              activeSegment === null
                ? manifest
                : {
                    ...manifest,
                    sealed: [...manifest.sealed, activeSegment],
                  };
            activeSegment = null;
            activeEvents = [];
          }

          if (activeSegment === null) {
            const firstEvent = group.events[0];
            if (!firstEvent) {
              throw new Error('Group events list is empty');
            }
            activeSegment = `${firstEvent.eventId}.jsonl`;
            activeEvents = [...group.events];
          } else {
            activeEvents = [...activeEvents, ...group.events];
          }

          const segmentPath = path.join(deviceDir, activeSegment);
          const fullJsonl =
            activeEvents.map((e) => JSON.stringify(serializeEvent(e))).join('\n') + '\n';
          await writeAtomically(segmentPath, fullJsonl);

          nActive = activeEvents.length;
          sActive = fullJsonl.length;

          const lastEvent = group.events.at(-1);
          if (!lastEvent) {
            throw new Error('Group events list is empty');
          }
          manifest = {
            ...manifest,
            lastEventId: lastEvent.eventId,
          };

          if (nActive >= maxEventsPerSegment || sActive >= maxBytesPerSegment) {
            manifest = {
              ...manifest,
              sealed: [...manifest.sealed, activeSegment],
            };
            activeSegment = null;
            activeEvents = [];
            nActive = 0;
            sActive = 0;
          }
        }

        await writeAtomically(manifestPath, JSON.stringify(manifest, null, 2));
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
