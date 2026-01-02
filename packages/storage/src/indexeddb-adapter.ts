import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { StorageAdapter, GraphStorageMetadata } from './types.js';

interface CanopyDB extends DBSchema {
  graphs: {
    key: string;
    value: {
      id: string;
      snapshot: Uint8Array;
      metadata: GraphStorageMetadata;
    };
  };
}

export class IndexedDBAdapter implements StorageAdapter {
  private db: IDBPDatabase<CanopyDB> | null = null;
  private dbName: string;

  constructor(dbName: string = 'canopy-storage') {
    this.dbName = dbName;
  }

  async init(): Promise<void> {
    if (this.db) return;
    this.db = await openDB<CanopyDB>(this.dbName, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('graphs')) {
          db.createObjectStore('graphs', { keyPath: 'id' });
        }
      },
    });
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  async save(graphId: string, snapshot: Uint8Array, metadata: GraphStorageMetadata): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.put('graphs', {
      id: graphId,
      snapshot,
      metadata,
    });
  }

  async load(graphId: string): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.get('graphs', graphId);
    return result ? result.snapshot : null;
  }

  async delete(graphId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    await this.db.delete('graphs', graphId);
  }

  async list(): Promise<GraphStorageMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');
    const all = await this.db.getAll('graphs');
    return all.map((item) => item.metadata);
  }
}
