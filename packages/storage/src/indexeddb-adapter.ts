import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { StorageAdapter, GraphStorageMetadata } from './types';
import type { Result } from '@canopy/types';
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
}

export const createIndexedDBAdapter = (dbName = 'canopy-storage'): StorageAdapter => {
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
  };
};
