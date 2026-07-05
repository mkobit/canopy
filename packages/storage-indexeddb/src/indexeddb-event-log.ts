import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import { ok, err, fromAsyncThrowable } from '@canopy/graph';

interface EventLogDB extends DBSchema {
  readonly events: Readonly<{
    // Not readonly: idb's DBSchemaValue#key must be assignable to IDBValidKey, whose array
    // variant is a mutable array type.
    key: [graphId: string, eventId: string];
    value: {
      graphId: string;
      eventId: string;
      event: GraphEvent;
    };
  }>;
}

export interface IndexedDBEventLog extends EventLogStore {
  readonly init: () => Promise<Result<void, Error>>;
  readonly close: () => Promise<Result<void, Error>>;
}

// Upper bound sentinel: greater than any UUIDv7 eventId string under key-range comparison.
const MAX_EVENT_ID = String.fromCodePoint(0xff_ff);

const applyQueryOptions = (
  events: readonly GraphEvent[],
  options: EventLogQueryOptions,
): readonly GraphEvent[] => {
  const { after, before, reverse, limit } = options;
  let filtered = events;

  if (after) {
    filtered = filtered.filter((event) => event.eventId > after);
  }

  if (before) {
    filtered = filtered.filter((event) => event.eventId < before);
  }

  if (reverse) {
    filtered = filtered.toReversed();
  }

  if (limit !== undefined && limit >= 0) {
    filtered = filtered.slice(0, limit);
  }

  return filtered;
};

export const createIndexedDBEventLog = (dbName = 'canopy-events'): IndexedDBEventLog => {
  let db = null as IDBPDatabase<EventLogDB> | null;

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (db) return ok(undefined);
      return fromAsyncThrowable(async () => {
        db = await openDB<EventLogDB>(dbName, 1, {
          upgrade(dbToUpgrade) {
            if (!dbToUpgrade.objectStoreNames.contains('events')) {
              dbToUpgrade.createObjectStore('events', { keyPath: ['graphId', 'eventId'] });
            }
            return;
          },
        });
        return;
      });
    },

    close: async (): Promise<Result<void, Error>> => {
      return fromAsyncThrowable(async () => {
        if (db) {
          db.close();
          db = null;
        }
        return;
      });
    },

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      const dbInstance = db;

      return fromAsyncThrowable(async () => {
        const tx = dbInstance.transaction('events', 'readwrite');
        await Promise.all([
          ...events.map((event) => tx.store.put({ graphId, eventId: event.eventId, event })),
          tx.done,
        ]);
        return;
      });
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      const dbInstance = db;

      return fromAsyncThrowable(async () => {
        const range = IDBKeyRange.bound([graphId, ''], [graphId, MAX_EVENT_ID]);
        const records = await dbInstance.getAll('events', range);
        const events = records.map((record) => record.event);

        return applyQueryOptions(events, options);
      });
    },
  };
};
