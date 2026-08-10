import type { IpcProtocolError, IpcSocketInUseError } from '@canopy/api-adapter';
import { createApiAdapterContext, createIpcServer } from '@canopy/api-adapter';
import type { EventLogStore, Result } from '@canopy/graph';
import { createGraphSession, err, ok } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createSQLiteEventLog } from '@canopy/storage-sqlite';
import type { DaemonConfig } from './config';
import { createFileSystemSqlitePersistence } from './sqlite-persistence';

export type DaemonHostError =
  | IpcSocketInUseError
  | IpcProtocolError
  | Readonly<{ _tag: 'DaemonEventLogError'; message: string }>;

const daemonEventLogError = (message: string): DaemonHostError => ({
  _tag: 'DaemonEventLogError',
  message,
});

// All-methods shape (no plain data fields) to satisfy functional/no-mixed-types --
// wraps the underlying IpcServer's socket-path/connection-count accessors rather
// than exposing the IpcServer instance itself, keeping this a narrow, purpose-built API.
export interface RunningHost {
  readonly getSocketPath: () => string;
  readonly getActiveConnectionCount: () => number;
  /** Closes the IPC server (destroys sockets, unbinds subscriptions, unlinks the socket file) and the event log. */
  readonly close: () => Promise<void>;
}

// Opens the configured EventLogStore, loads a GraphSession from it, and hosts
// createIpcServer against a context built from that *loaded* session -- per
// design.md Decision 1 step 4, supplying only the static graph snapshot would
// serve stale reads once a mutation lands.
const bootWithEventLog = async (
  config: DaemonConfig,
  eventLog: EventLogStore,
  closeEventLog: () => Promise<void>,
): Promise<Result<RunningHost, DaemonHostError>> => {
  const session = createGraphSession(eventLog, config.graphId, config.deviceId);

  const loadResult = await session.load();
  if (!loadResult.ok) {
    await closeEventLog();
    return err(daemonEventLogError(`Failed to load graph session: ${loadResult.error.message}`));
  }

  const context = createApiAdapterContext({
    graph: session.graph(),
    session,
    eventLogStore: eventLog,
  });

  const server = createIpcServer({ socketPath: config.socketPath, context });
  const listenResult = await server.listen();
  if (!listenResult.ok) {
    await closeEventLog();
    return err(listenResult.error);
  }

  return ok({
    getSocketPath: () => server.getSocketPath(),
    getActiveConnectionCount: () => server.getActiveConnectionCount(),
    close: async () => {
      await server.close();
      await closeEventLog();
    },
  });
};

/**
 * Boots the host: opens an EventLogStore (SQLite-on-disk, or in-memory in
 * ephemeral mode), loads a GraphSession, builds a live ApiAdapterContext, and
 * hosts createIpcServer. On IpcSocketInUseError (another host already owns
 * this socket path) this fails fast without binding a second listener.
 */
export const startHost = async (
  config: DaemonConfig,
): Promise<Result<RunningHost, DaemonHostError>> => {
  if (config.ephemeral) {
    return bootWithEventLog(config, createInMemoryEventStore(), () => Promise.resolve());
  }

  const persistence = createFileSystemSqlitePersistence(config.databasePath);
  const eventLog = createSQLiteEventLog(persistence);

  const initResult = await eventLog.init();
  if (!initResult.ok) {
    return err(daemonEventLogError(`Failed to open event log: ${initResult.error.message}`));
  }

  return bootWithEventLog(config, eventLog, async () => {
    const closeResult = await eventLog.close();
    if (!closeResult.ok) {
      // Best-effort shutdown -- the process is exiting either way.
      console.error(`Failed to close event log cleanly: ${closeResult.error.message}`);
    }
  });
};
