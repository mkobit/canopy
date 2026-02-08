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

// eslint-disable-next-line functional/no-classes
export class IndexedDBAdapter implements StorageAdapter {
  // eslint-disable-next-line functional/prefer-immutable-types
  private db: IDBPDatabase<CanopyDB> | null = null;
  private readonly dbName: string;

  constructor(dbName = 'canopy-storage') {
    this.dbName = dbName;
  }

  async init(): Promise<Result<void, Error>> {
    if (this.db) return ok(undefined);
    return fromAsyncThrowable(async () => {
      this.db = await openDB<CanopyDB>(this.dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('graphs')) {
            db.createObjectStore('graphs', { keyPath: 'id' });
          }
          return;
        },
      });
      return;
    });
  }

  async close(): Promise<Result<void, Error>> {
    return fromAsyncThrowable(async () => {
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      return;
    });
  }

  async save(
    graphId: string,
    snapshot: Uint8Array,
    metadata: GraphStorageMetadata,
  ): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    return fromAsyncThrowable(async () => {
      await this.db!.put('graphs', {
        id: graphId,
        snapshot,
        metadata,
      });
      return;
    });
  }

  async load(graphId: string): Promise<Result<Uint8Array | null, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    return fromAsyncThrowable(async () => {
      const result = await this.db!.get('graphs', graphId);
      return result ? result.snapshot : null;
    });
  }

  async delete(graphId: string): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    return fromAsyncThrowable(async () => {
      await this.db!.delete('graphs', graphId);
      return;
    });
  }

  async list(): Promise<Result<readonly GraphStorageMetadata[], Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    return fromAsyncThrowable(async () => {
      const all = await this.db!.getAll('graphs');
      return all.map((item) => item.metadata);
    });
  }
}
