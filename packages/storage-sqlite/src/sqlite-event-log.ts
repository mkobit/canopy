import type { Database, SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js';
import type { Result, GraphEvent, EventLogStore, EventLogQueryOptions } from '@canopy/graph';
import { ok, err, fromAsyncThrowable } from '@canopy/graph';

export interface SQLitePersistence {
  readonly read: () => Promise<Uint8Array | null>;
  readonly write: (data: Uint8Array) => Promise<void>;
}

export interface SQLiteEventLog extends EventLogStore {
  readonly init: () => Promise<Result<void, Error>>;
  readonly close: () => Promise<Result<void, Error>>;
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
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
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

// eslint-disable-next-line max-lines-per-function
export const createSQLiteEventLog = (persistence?: SQLitePersistence): SQLiteEventLog => {
  let db = null as Database | null;

  let SQL = null as SqlJsStatic | null;

  const initSchema = () => {
    if (!db) return; // Should not happen if called from init
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
    return;
  };

  const persist = async (): Promise<void> => {
    if (!persistence || !db) {
      return;
    }
    const data = db.export();
    await persistence.write(data);
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

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!db) return err(new Error('Database not initialized'));

      const dbInstance = db;
      const result = await fromAsyncThrowable(async () => {
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
      });

      if (!result.ok) {
        dbInstance.run('ROLLBACK');
      }
      return result;
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!db) return err(new Error('Database not initialized'));
      const dbInstance = db;

      return fromAsyncThrowable(async () => {
        let query = 'SELECT payload FROM events WHERE graph_id = ?';
        const params = [graphId] as (string | number | null)[];

        if (options.after) {
          query += ' AND event_id > ?';

          params.push(options.after);
        }

        if (options.before) {
          query += ' AND event_id < ?';

          params.push(options.before);
        }

        // eslint-disable-next-line unicorn/prefer-ternary
        if (options.reverse) {
          query += ' ORDER BY event_id DESC';
        } else {
          query += ' ORDER BY event_id ASC';
        }

        if (options.limit) {
          query += ' LIMIT ?';

          params.push(options.limit);
        }

        const stmt = dbInstance.prepare(query);
        stmt.bind(params);

        const events = [] as GraphEvent[];

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
