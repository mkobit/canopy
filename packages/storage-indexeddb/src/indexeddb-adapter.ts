import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { StorageAdapter, GraphStorageMetadata } from '@canopy/storage';
import type { Result } from '@canopy/graph';
import { ok, err, fromAsyncThrowable } from '@canopy/graph';

interface CanopyDB extends DBSchema {
  readonly graphs: Readonly<{
    key: string;
    value: {
      id: string;
      snapshot: Uint8Array;
      metadata: GraphStorageMetadata;
    };
  }>;
}

/**
 * @deprecated Yjs-snapshot storage. Kept only as the read path for the one-time legacy vault
 * import (see `docs/design/2026-07-03-event-log-storage-and-sync.md`); deleted once that import ships.
 */
export const createIndexedDBAdapter = (dbName = 'canopy-storage'): StorageAdapter => {
  let db = null as IDBPDatabase<CanopyDB> | null;

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (db) return ok(undefined);
      return fromAsyncThrowable(async () => {
        db = await openDB<CanopyDB>(dbName, 1, {
          upgrade(dbToUpgrade) {
            if (!dbToUpgrade.objectStoreNames.contains('graphs')) {
              dbToUpgrade.createObjectStore('graphs', { keyPath: 'id' });
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
      const dbInstance = db;
      return fromAsyncThrowable(async () => {
        await dbInstance.put('graphs', {
          id: graphId,
          snapshot,
          metadata,
        });
        return;
      });
    },

    load: async (graphId: string): Promise<Result<Uint8Array | null, Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      const dbInstance = db;
      return fromAsyncThrowable(async () => {
        const result = await dbInstance.get('graphs', graphId);
        return result ? result.snapshot : null;
      });
    },

    delete: async (graphId: string): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      const dbInstance = db;
      return fromAsyncThrowable(async () => {
        await dbInstance.delete('graphs', graphId);
        return;
      });
    },

    list: async (): Promise<Result<readonly GraphStorageMetadata[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      const dbInstance = db;
      return fromAsyncThrowable(async () => {
        const all = await dbInstance.getAll('graphs');
        return all.map((item) => item.metadata);
      });
    },
  };
};
