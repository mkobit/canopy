import type { Database, SqlJsStatic, Statement } from 'sql.js';
import initSqlJs from 'sql.js';
import type {
  Result,
  GraphEvent,
  EventLogStore,
  EventLogQueryOptions,
  PropertyValue,
} from '@canopy/graph';
import { ok, err, fromAsyncThrowable, fromThrowable } from '@canopy/graph';

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const deserializeEvent = (storable: unknown): Result<GraphEvent, Error> => {
  if (!isObject(storable) || typeof storable.type !== 'string') {
    return err(new Error('Invalid storable event'));
  }

  switch (storable.type) {
    case 'NodeCreated':
    case 'EdgeCreated': {
      const properties = isObject(storable.properties)
        ? new Map(Object.entries(storable.properties as Record<string, PropertyValue>))
        : new Map();
      return ok({
        ...storable,
        properties,
      } as unknown as GraphEvent);
    }
    case 'NodePropertiesUpdated':
    case 'EdgePropertiesUpdated': {
      const changes = isObject(storable.changes)
        ? new Map(Object.entries(storable.changes as Record<string, PropertyValue>))
        : new Map();
      return ok({
        ...storable,
        changes,
      } as unknown as GraphEvent);
    }
    case 'NodeDeleted':
    case 'EdgeDeleted':
    case 'WorkflowStarted':
    case 'WorkflowCompleted': {
      return ok(storable as unknown as GraphEvent);
    }
    default: {
      return err(new Error(`Unknown event type: ${storable.type}`));
    }
  }
};

interface QueryPlan {
  readonly query: string;
  readonly parameters: readonly (string | number | null)[];
}

const buildSelectQuery = (graphId: string, options: EventLogQueryOptions): QueryPlan => {
  const afterClause = options.after ? ' AND event_id > ?' : '';
  const beforeClause = options.before ? ' AND event_id < ?' : '';
  const orderClause = options.reverse ? ' ORDER BY event_id DESC' : ' ORDER BY event_id ASC';
  const limitClause = options.limit ? ' LIMIT ?' : '';

  const query = `SELECT payload FROM events WHERE graph_id = ?${afterClause}${beforeClause}${orderClause}${limitClause}`;

  const parameters = [
    graphId,
    ...(options.after ? [options.after] : []),
    ...(options.before ? [options.before] : []),
    ...(options.limit ? [options.limit] : []),
  ];

  return { query, parameters };
};

const initSchema = (database: Database): void => {
  database.run(`
    CREATE TABLE IF NOT EXISTS events (
      graph_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (graph_id, event_id)
    );
  `);
};

const insertBatch = (
  statement: Statement,
  graphId: string,
  events: readonly GraphEvent[],
): readonly undefined[] =>
  events.map((event) => {
    const storable = serializeEvent(event);
    const payload = JSON.stringify(storable);
    statement.run([graphId, event.eventId, event.timestamp, event.type, payload]);
    return undefined;
  });

const executeAppendEvents = async (
  databaseInstance: Database,
  persist: () => Promise<void>,
  graphId: string,
  events: readonly GraphEvent[],
): Promise<Result<void, Error>> => {
  const result = await fromAsyncThrowable(async () => {
    databaseInstance.run('BEGIN TRANSACTION');
    const statement = databaseInstance.prepare(`
      INSERT OR IGNORE INTO events (graph_id, event_id, timestamp, type, payload)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertBatch(statement, graphId, events);
    statement.free();

    databaseInstance.run('COMMIT');
    await persist();
    return;
  });

  if (!result.ok) {
    databaseInstance.run('ROLLBACK');
  }
  return result;
};

const executeGetEvents = (
  databaseInstance: Database,
  graphId: string,
  options: EventLogQueryOptions,
): Result<readonly GraphEvent[], Error> => {
  const rawResult = fromThrowable(() => {
    const { query, parameters } = buildSelectQuery(graphId, options);
    return databaseInstance.exec(query, parameters as (string | number | null)[]);
  });

  if (!rawResult.ok) {
    return rawResult;
  }

  const firstResult = rawResult.value[0];
  if (!firstResult) {
    return ok([]);
  }

  const eventResults = firstResult.values.map(([payload]) => {
    const jsonResult = fromThrowable(() => JSON.parse(payload as string) as unknown);
    if (!jsonResult.ok) {
      return jsonResult;
    }
    return deserializeEvent(jsonResult.value);
  });

  const firstError = eventResults.find((r) => !r.ok);
  if (firstError && !firstError.ok) {
    return firstError;
  }

  return ok(eventResults.map((r) => (r as { ok: true; value: GraphEvent }).value));
};

export const createSQLiteEventLog = (persistence?: SQLitePersistence): SQLiteEventLog => {
  let database = null as Database | null;
  let SQL = null as SqlJsStatic | null;

  const persist = async (): Promise<void> => {
    if (!persistence || !database) {
      return;
    }
    const data = database.export();
    await persistence.write(data);
  };

  return {
    init: async (): Promise<Result<void, Error>> => {
      if (database) return ok(undefined);

      return fromAsyncThrowable(async () => {
        SQL = await initSqlJs();
        const data = persistence ? await persistence.read() : null;

        if (data) {
          database = new SQL.Database(data);
        } else {
          database = new SQL.Database();
          initSchema(database);
        }
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

    appendEvents: async (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      if (!database) return err(new Error('Database not initialized'));
      return executeAppendEvents(database, persist, graphId, events);
    },

    getEvents: async (
      graphId: string,
      options: EventLogQueryOptions = {},
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      if (!database) return err(new Error('Database not initialized'));
      return executeGetEvents(database, graphId, options);
    },
  };
};
