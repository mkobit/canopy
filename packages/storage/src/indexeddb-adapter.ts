import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type {
  StorageAdapter,
  GraphStorageMetadata,
  EventLogStore,
  EventLogQueryOptions,
} from './types';
import type { Result, GraphEvent } from '@canopy/types';
import { ok, err, fromAsyncThrowable } from '@canopy/types';

interface CanopyDB extends DBSchema {
  readonly graphs: Readonly<{
    key: string;
    value: {
      id: string;
      snapshot: Uint8Array;
      metadata: GraphStorageMetadata;
    };
  }>;
  readonly events: {
    key: string; // event_id
    value: {
      readonly graphId: string;
      readonly eventId: string;
      readonly payload: string; // JSON-serialized event
    };
    indexes: { 'by-graph-event': [string, string] };
  };
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
    case 'EdgeDeleted': {
      return event;
    }
  }
};

const deserializeEvent = (storable: unknown): GraphEvent => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = storable as any;
  switch (s.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      return {
        ...s,
        properties: new Map(Object.entries(s.properties)),
      } as GraphEvent;
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      return {
        ...s,
        changes: new Map(Object.entries(s.changes)),
      } as GraphEvent;
    }
    case 'NodeDeleted':
    case 'EdgeDeleted': {
      return s as GraphEvent;
    }
    default: {
      // eslint-disable-next-line functional/no-throw-statements
      throw new Error(`Unknown event type: ${s.type}`);
    }
  }
};

export const createIndexedDBAdapter = (
  dbName = 'canopy-storage',
): StorageAdapter & EventLogStore => {
  let db: IDBPDatabase<CanopyDB> | null = null;

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (db) return ok(undefined);
      return fromAsyncThrowable(async () => {
        db = await openDB<CanopyDB>(dbName, 1, {
          upgrade(dbToUpgrade) {
            if (!dbToUpgrade.objectStoreNames.contains('graphs')) {
              dbToUpgrade.createObjectStore('graphs', { keyPath: 'id' });
            }
            if (!dbToUpgrade.objectStoreNames.contains('events')) {
              const store = dbToUpgrade.createObjectStore('events', { keyPath: 'eventId' });
              store.createIndex('by-graph-event', ['graphId', 'eventId']);
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

    save: async (
      graphId: string,
      snapshot: Uint8Array,
      metadata: GraphStorageMetadata,
    ): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      return fromAsyncThrowable(async () => {
        await db!.put('graphs', {
          id: graphId,
          snapshot,
          metadata,
        });
        return;
      });
    },

    load: async (graphId: string): Promise<Result<Uint8Array | null, Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      return fromAsyncThrowable(async () => {
        const result = await db!.get('graphs', graphId);
        return result ? result.snapshot : null;
      });
    },

    delete: async (graphId: string): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      return fromAsyncThrowable(async () => {
        await db!.delete('graphs', graphId);
        return;
      });
    },

    list: async (): Promise<Result<readonly GraphStorageMetadata[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      return fromAsyncThrowable(async () => {
        const all = await db!.getAll('graphs');
        return all.map((item) => item.metadata);
      });
    },

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      return fromAsyncThrowable(async () => {
        const tx = db!.transaction('events', 'readwrite');
        // eslint-disable-next-line functional/no-loop-statements
        for (const event of events) {
          const storable = serializeEvent(event);
          await tx.store.put({
            graphId,
            eventId: event.eventId,
            payload: JSON.stringify(storable),
          });
        }
        await tx.done;
        return;
      });
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      return fromAsyncThrowable(async () => {
        let range: IDBKeyRange;
        if (options.after && options.before) {
          range = IDBKeyRange.bound(
            [graphId, options.after],
            [graphId, options.before],
            true,
            true,
          );
        } else if (options.after) {
          range = IDBKeyRange.bound([graphId, options.after], [graphId, '\uffff'], true, false);
        } else if (options.before) {
          range = IDBKeyRange.bound([graphId, ''], [graphId, options.before], false, true);
        } else {
          range = IDBKeyRange.bound([graphId, ''], [graphId, '\uffff']);
        }

        let records = await db!.getAllFromIndex('events', 'by-graph-event', range);

        if (options.reverse) {
          records = records.toReversed();
        }

        if (options.limit !== undefined) {
          records = records.slice(0, options.limit);
        }

        return records.map((r) => deserializeEvent(JSON.parse(r.payload)));
      });
    },
  };
};
