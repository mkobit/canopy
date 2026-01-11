import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { StorageAdapter, GraphStorageMetadata } from './types';
import { Result, ok, err, fromAsyncThrowable } from '@canopy/types';

export interface SQLitePersistence {
  readonly read: () => Promise<Uint8Array | null>;
  readonly write: (data: Uint8Array) => Promise<void>;
}

export class SQLiteAdapter implements StorageAdapter {
  // eslint-disable-next-line functional/prefer-readonly-type, functional/immutable-data, functional/prefer-immutable-types
  private db: Database | null = null;
  // eslint-disable-next-line functional/prefer-readonly-type, functional/immutable-data, functional/prefer-immutable-types
  private SQL: SqlJsStatic | null = null;
  private readonly persistence: SQLitePersistence | null;

  constructor(persistence?: SQLitePersistence) {
    this.persistence = persistence || null;
  }

  async init(): Promise<Result<void, Error>> {
    if (this.db) return ok(undefined);

    return fromAsyncThrowable(async () => {
      this.SQL = await initSqlJs();

      const data = this.persistence ? await this.persistence.read() : null;

      if (data) {
        this.db = new this.SQL.Database(data);
      } else {
        this.db = new this.SQL.Database();
        this.initSchema();
      }
      return undefined;
    });
  }

  private initSchema() {
    if (!this.db) return undefined; // Should not happen if called from init
    this.db.run(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        name TEXT,
        snapshot BLOB,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    return undefined;
  }

  async close(): Promise<Result<void, Error>> {
    return fromAsyncThrowable(async () => {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        return undefined;
    });
  }

  private async persist(): Promise<void> {
    if (this.persistence && this.db) {
      const data = this.db.export();
      await this.persistence.write(data);
    }
  }

  async save(graphId: string, snapshot: Uint8Array, metadata: GraphStorageMetadata): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // Check if exists to decide insert or update? Or just REPLACE INTO (sqlite) or INSERT OR REPLACE
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stmt = this.db!.prepare(`
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
      return undefined;
    });
  }

  async load(graphId: string): Promise<Result<Uint8Array | null, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stmt = this.db!.prepare('SELECT snapshot FROM graphs WHERE id = ?');
      stmt.bind([graphId]);

      if (stmt.step()) {
        const result = stmt.getAsObject();
        stmt.free();
        return result.snapshot as Uint8Array;
      }

      stmt.free();
      return null;
    });
  }

  async delete(graphId: string): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.db!.run('DELETE FROM graphs WHERE id = ?', [graphId]);
      await this.persist();
      return undefined;
    });
  }

  async list(): Promise<Result<readonly GraphStorageMetadata[], Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // eslint-disable-next-line functional/prefer-readonly-type
      const result: GraphStorageMetadata[] = [];
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stmt = this.db!.prepare('SELECT id, name, created_at, updated_at FROM graphs');

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
    });
  }
}
