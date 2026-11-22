import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import { decodeStoredEvent, ok, err, fromAsyncThrowable } from '@canopy/graph';

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

const decodeChunk = (
  ordered: readonly EventLogDB['events']['value'][],
  offset: number,
  limitCount: number,
  collected: readonly GraphEvent[],
): Result<readonly GraphEvent[], Error> => {
  if (collected.length >= limitCount || offset >= ordered.length) {
    return ok(collected.slice(0, limitCount));
  }
  const needed = limitCount - collected.length;
  const slice = ordered.slice(offset, offset + needed);
  const decodedResults = slice.map((record) => decodeStoredEvent(record.event));
  const firstError = decodedResults.find((result) => !result.ok);
  if (firstError && !firstError.ok) {
    return err(new Error(firstError.error.message));
  }
  const valid = decodedResults.flatMap((result) =>
    result.ok && result.value !== null ? [result.value] : [],
  );
  return decodeChunk(ordered, offset + slice.length, limitCount, [...collected, ...valid]);
};

const decodeIndexedDBRecords = (
  records: readonly EventLogDB['events']['value'][],
  options: EventLogQueryOptions,
): Result<readonly GraphEvent[], Error> => {
  const limitCount = options.limit !== undefined && options.limit >= 0 ? options.limit : undefined;
  if (limitCount === 0) {
    return ok([]);
  }

  const ordered = options.reverse ? records.toReversed() : records;
  if (limitCount !== undefined) {
    return decodeChunk(ordered, 0, limitCount, []);
  }

  const decodedResults = ordered.map((record) => decodeStoredEvent(record.event));
  const firstError = decodedResults.find((result) => !result.ok);
  return firstError && !firstError.ok
    ? err(new Error(firstError.error.message))
    : ok(
        decodedResults.flatMap((result) =>
          result.ok && result.value !== null ? [result.value] : [],
        ),
      );
};

export const createIndexedDBEventLog = (databaseName = 'canopy-events'): IndexedDBEventLog => {
  let database = null as IDBPDatabase<EventLogDB> | null;

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (database) return ok(undefined);
      return fromAsyncThrowable(async () => {
        database = await openDB<EventLogDB>(databaseName, 1, {
          upgrade(databaseToUpgrade) {
            if (!databaseToUpgrade.objectStoreNames.contains('events')) {
              databaseToUpgrade.createObjectStore('events', { keyPath: ['graphId', 'eventId'] });
            }
            return;
          },
        });
        return;
      });
    },

    close: async (): Promise<Result<void, Error>> => {
      return fromAsyncThrowable(async () => {
        if (database) {
          database.close();
          database = null;
        }
        return;
      });
    },

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!database) return err(new Error('Database not initialized'));
      const databaseInstance = database;

      return fromAsyncThrowable(async () => {
        const tx = databaseInstance.transaction('events', 'readwrite');
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
      if (!database) return err(new Error('Database not initialized'));
      const databaseInstance = database;

      const lowerKey = options.after ?? '';
      const lowerOpen = options.after !== undefined;
      const upperKey = options.before ?? MAX_EVENT_ID;
      const upperOpen = options.before !== undefined;

      if (lowerKey > upperKey || (lowerKey === upperKey && (lowerOpen || upperOpen))) {
        return ok([]);
      }

      const recordsResult = await fromAsyncThrowable(async () => {
        const range = IDBKeyRange.bound(
          [graphId, lowerKey],
          [graphId, upperKey],
          lowerOpen,
          upperOpen,
        );
        return databaseInstance.getAll('events', range);
      });

      return recordsResult.ok
        ? decodeIndexedDBRecords(recordsResult.value, options)
        : recordsResult;
    },
  };
};
