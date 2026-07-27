import type { DBSchema, IDBPDatabase } from 'idb';
import { openDB } from 'idb';
import type { Result } from '@canopy/graph';
import { ok, err, fromAsyncThrowable } from '@canopy/graph';

export interface GraphRegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface GraphRegistryDB extends DBSchema {
  readonly graphs: Readonly<{
    key: string;
    value: GraphRegistryEntry;
  }>;
}

/**
 * Lists known graphs by id/name/timestamps, independent of EventLogStore (which is scoped to a
 * known graphId and has no enumerate-all operation). Backs the home page's graph list/create/delete.
 */
export interface GraphRegistry {
  readonly init: () => Promise<Result<void, Error>>;
  readonly close: () => Promise<Result<void, Error>>;
  readonly list: () => Promise<Result<readonly GraphRegistryEntry[], Error>>;
  readonly upsert: (entry: GraphRegistryEntry) => Promise<Result<void, Error>>;
  readonly delete: (id: string) => Promise<Result<void, Error>>;
}

export const createGraphRegistry = (databaseName = 'canopy-registry'): GraphRegistry => {
  let database = null as IDBPDatabase<GraphRegistryDB> | null;

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (database) return ok(undefined);
      return fromAsyncThrowable(async () => {
        database = await openDB<GraphRegistryDB>(databaseName, 1, {
          upgrade(databaseToUpgrade) {
            if (!databaseToUpgrade.objectStoreNames.contains('graphs')) {
              databaseToUpgrade.createObjectStore('graphs', { keyPath: 'id' });
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

    list: async (): Promise<Result<readonly GraphRegistryEntry[], Error>> => {
      if (!database) return err(new Error('Database not initialized'));
      const databaseInstance = database;
      return fromAsyncThrowable(async () => databaseInstance.getAll('graphs'));
    },

    upsert: async (entry: GraphRegistryEntry): Promise<Result<void, Error>> => {
      if (!database) return err(new Error('Database not initialized'));
      const databaseInstance = database;
      return fromAsyncThrowable(async () => {
        await databaseInstance.put('graphs', entry);
        return;
      });
    },

    delete: async (id: string): Promise<Result<void, Error>> => {
      if (!database) return err(new Error('Database not initialized'));
      const databaseInstance = database;
      return fromAsyncThrowable(async () => {
        await databaseInstance.delete('graphs', id);
        return;
      });
    },
  };
};
