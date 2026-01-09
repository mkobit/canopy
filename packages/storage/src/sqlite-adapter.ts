import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { StorageAdapter, GraphStorageMetadata } from './types';

export interface SQLitePersistence {
  read(): Promise<Uint8Array | null>;
  write(data: Uint8Array): Promise<void>;
}

export class SQLiteAdapter implements StorageAdapter {
  // eslint-disable-next-line functional/prefer-readonly-type
  private db: Database | null = null;
  // eslint-disable-next-line functional/prefer-readonly-type
  private SQL: SqlJsStatic | null = null;
  private readonly persistence: SQLitePersistence | null;

  constructor(persistence?: SQLitePersistence) {
    this.persistence = persistence || null;
  }

  async init(): Promise<void> {
    if (this.db) return;

    this.SQL = await initSqlJs();

    const data = this.persistence ? await this.persistence.read() : null;

    if (data) {
      this.db = new this.SQL.Database(data);
    } else {
      this.db = new this.SQL.Database();
      this.initSchema();
    }
  }

  private initSchema() {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        name TEXT,
        snapshot BLOB,
        created_at TEXT,
        updated_at TEXT
      );
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async persist(): Promise<void> {
    if (this.persistence && this.db) {
      const data = this.db.export();
      await this.persistence.write(data);
    }
  }

  async save(graphId: string, snapshot: Uint8Array, metadata: GraphStorageMetadata): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Check if exists to decide insert or update? Or just REPLACE INTO (sqlite) or INSERT OR REPLACE
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO graphs (id, name, snapshot, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run([
      graphId,
      metadata.name,
      snapshot,
      metadata.createdAt,
      metadata.updatedAt
    ]);
    stmt.free();

    await this.persist();
  }

  async load(graphId: string): Promise<Uint8Array | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT snapshot FROM graphs WHERE id = ?');
    stmt.bind([graphId]);

    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return result.snapshot as Uint8Array;
    }

    stmt.free();
    return null;
  }

  async delete(graphId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.run('DELETE FROM graphs WHERE id = ?', [graphId]);
    await this.persist();
  }

  async list(): Promise<readonly GraphStorageMetadata[]> {
    if (!this.db) throw new Error('Database not initialized');

    // eslint-disable-next-line functional/prefer-readonly-type
    const result: GraphStorageMetadata[] = [];
    const stmt = this.db.prepare('SELECT id, name, created_at, updated_at FROM graphs');

    // eslint-disable-next-line functional/no-loop-statements
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push({
        id: row.id as string,
        name: row.name as string,
        createdAt: row.created_at as string,
        updatedAt: row.updated_at as string,
      });
    }

    stmt.free();
    return result;
  }
}
