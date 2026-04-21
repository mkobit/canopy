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

export const createSQLiteAdapter = (
  persistence?: SQLitePersistence,
): StorageAdapter & EventLogStore => {
  let db: Database | null = null;

  let SQL: SqlJsStatic | null = null;

  const initSchema = () => {
    if (!db) return; // Should not happen if called from init
    db.run(`
      CREATE TABLE IF NOT EXISTS graphs (
        id TEXT PRIMARY KEY,
        name TEXT,
        snapshot BLOB,
        created_at TEXT,
        updated_at TEXT
      );
    `);
    db.run(`
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
  };

  const persist = async (): Promise<void> => {
    if (persistence && db) {
      const data = db.export();
      await persistence.write(data);
    }
  };

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (db) return ok(undefined);

      return fromAsyncThrowable(async () => {
        SQL = await initSqlJs();

        const data = persistence ? await persistence.read() : null;

        if (data) {
          db = new SQL.Database(data);
        } else {
          db = new SQL.Database();
          initSchema();
        }
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
        const stmt = db!.prepare(`
          REPLACE INTO graphs (id, name, snapshot, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `);

        stmt.run([graphId, metadata.name, snapshot, metadata.createdAt, metadata.updatedAt]);
        stmt.free();

        await persist();
        return;
      });
    },

    load: async (graphId: string): Promise<Result<Uint8Array | null, Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      return fromAsyncThrowable(async () => {
        const stmt = db!.prepare('SELECT snapshot FROM graphs WHERE id = ?');
        stmt.bind([graphId]);

        if (stmt.step()) {
          const result = stmt.getAsObject();
          stmt.free();
          return result.snapshot as Uint8Array;
        }

        stmt.free();
        return null;
      });
    },

    delete: async (graphId: string): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      return fromAsyncThrowable(async () => {
        db!.run('DELETE FROM graphs WHERE id = ?', [graphId]);
        db!.run('DELETE FROM events WHERE graph_id = ?', [graphId]);
        await persist();
        return;
      });
    },

    list: async (): Promise<Result<readonly GraphStorageMetadata[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      return fromAsyncThrowable(async () => {
        const result: GraphStorageMetadata[] = [];

        const stmt = db!.prepare('SELECT id, name, created_at, updated_at FROM graphs');

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
    },

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      const dbInstance = db;
      return fromAsyncThrowable(async () => {
        dbInstance.run('BEGIN TRANSACTION');
        const stmt = dbInstance.prepare(`
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

        dbInstance.run('COMMIT');
        await persist();
        return;
      }).then((result) => {
        if (!result.ok) {
          dbInstance.run('ROLLBACK');
        }
        return result;
      });
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      return fromAsyncThrowable(async () => {
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

        const stmt = db!.prepare(query);
        stmt.bind(params);

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
    },
  };
};
