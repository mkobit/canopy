import type { Database, SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js';
import type {
  StorageAdapter,
  GraphStorageMetadata,
  EventLogStore,
  EventLogQueryOptions,
} from './types';
import type { Result, GraphEvent } from '@canopy/types';
import { ok, err, fromAsyncThrowable } from '@canopy/types';

export interface SQLitePersistence {
  readonly read: () => Promise<Uint8Array | null>;
  readonly write: (data: Uint8Array) => Promise<void>;
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

// eslint-disable-next-line functional/no-classes
export class SQLiteAdapter implements StorageAdapter, EventLogStore {
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
      return;
    });
  }

  private initSchema() {
    if (!this.db) return; // Should not happen if called from init
    this.db.run(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        name TEXT,
        snapshot BLOB,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS events (
        graph_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        PRIMARY KEY (graph_id, event_id)
      );
    `);
    // Redundant index removed
    return;
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

  private async persist(): Promise<void> {
    if (this.persistence && this.db) {
      const data = this.db.export();
      await this.persistence.write(data);
    }
  }

  async save(
    graphId: string,
    snapshot: Uint8Array,
    metadata: GraphStorageMetadata,
  ): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // Check if exists to decide insert or update? Or just REPLACE INTO (sqlite) or INSERT OR REPLACE
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stmt = this.db!.prepare(`
        INSERT OR REPLACE INTO graphs (id, name, snapshot, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);

      stmt.run([graphId, metadata.name, snapshot, metadata.createdAt, metadata.updatedAt]);
      stmt.free();

      await this.persist();
      return;
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
      this.db!.run('DELETE FROM events WHERE graph_id = ?', [graphId]);
      await this.persist();
      return;
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

  async appendEvents(graphId: string, events: readonly GraphEvent[]): Promise<Result<void, Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.db!.run('BEGIN TRANSACTION');
      // eslint-disable-next-line functional/no-try-statements
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const stmt = this.db!.prepare(`
          INSERT OR IGNORE INTO events (graph_id, event_id, timestamp, type, payload)
          VALUES (?, ?, ?, ?, ?)
        `);

        // eslint-disable-next-line functional/no-loop-statements
        for (const event of events) {
          const storable = serializeEvent(event);
          const payload = JSON.stringify(storable);
          stmt.run([graphId, event.eventId, event.timestamp, event.type, payload]);
        }
        stmt.free();
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.db!.run('COMMIT');
        await this.persist();
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.db!.run('ROLLBACK');
        throw error;
      }
      return;
    });
  }

  async getEvents(
    graphId: string,
    options: EventLogQueryOptions = {},
  ): Promise<Result<readonly GraphEvent[], Error>> {
    if (!this.db) return err(new Error('Database not initialized'));

    return fromAsyncThrowable(async () => {
      // eslint-disable-next-line functional/no-let
      let query = 'SELECT payload FROM events WHERE graph_id = ?';
      const params: (string | number | null)[] = [graphId];

      if (options.after) {
        query += ' AND event_id > ?';
        params.push(options.after);
      }

      if (options.before) {
        query += ' AND event_id < ?';
        params.push(options.before);
      }

      query += ` ORDER BY event_id ${options.reverse ? 'DESC' : 'ASC'}`;

      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const stmt = this.db!.prepare(query);
      stmt.bind(params);

      // eslint-disable-next-line functional/prefer-readonly-type
      const events: GraphEvent[] = [];
      // eslint-disable-next-line functional/no-loop-statements
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const storable = JSON.parse(row.payload as string);
        events.push(deserializeEvent(storable));
      }
      stmt.free();
      return events;
    });
  }
}
