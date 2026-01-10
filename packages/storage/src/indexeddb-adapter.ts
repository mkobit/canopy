import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { StorageAdapter, GraphStorageMetadata } from './types';
import { Result, ok, err } from '@canopy/types';

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

export class IndexedDBAdapter implements StorageAdapter {
  // eslint-disable-next-line functional/prefer-readonly-type
  private db: IDBPDatabase<CanopyDB> | null = null;
  private readonly dbName: string;

  constructor(dbName = 'canopy-storage') {
    this.dbName = dbName;
  }

  async init(): Promise<Result<void, Error>> {
    if (this.db) return ok(undefined);
    try {
      this.db = await openDB<CanopyDB>(this.dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('graphs')) {
            db.createObjectStore('graphs', { keyPath: 'id' });
          }
        },
      });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async close(): Promise<Result<void, Error>> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    return ok(undefined);
  }

  async save(graphId: string, snapshot: Uint8Array, metadata: GraphStorageMetadata): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    try {
      await this.db.put('graphs', {
        id: graphId,
        snapshot,
        metadata,
      });
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async load(graphId: string): Promise<Result<Uint8Array | null, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    try {
      const result = await this.db.get('graphs', graphId);
      return ok(result ? result.snapshot : null);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async delete(graphId: string): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    try {
      await this.db.delete('graphs', graphId);
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async list(): Promise<Result<readonly GraphStorageMetadata[], Error>> {
    if (!this.db) return err(new Error('Database not initialized'));
    try {
      const all = await this.db.getAll('graphs');
      return ok(all.map((item) => item.metadata));
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }
}
