import * as os from 'node:os';
import * as path from 'node:path';
import type { DeviceId, GraphId, Result } from '@canopy/graph';
import { asDeviceId, asGraphId, createDeviceId, err, ok } from '@canopy/graph';

/**
 * Fixed default graph id so a daemon restarted against the same database path
 * continues appending to (and reading) the same event log. Deliberately not a
 * UUID -- asGraphId/GraphId are trusted string casts with no runtime format
 * validation, so any stable, human-readable string is a valid graph id.
 */
const DEFAULT_GRAPH_ID = 'canopy-default-graph';

const DEFAULT_SOCKET_FILE_NAME = 'canopy.sock';
const DEFAULT_DATABASE_FILE_NAME = 'canopy.sqlite';

export type DaemonConfigError = Readonly<{
  _tag: 'DaemonConfigError';
  message: string;
}>;

const daemonConfigError = (message: string): DaemonConfigError => ({
  _tag: 'DaemonConfigError',
  message,
});

export type DaemonConfig = Readonly<{
  /** Absolute path to the Unix domain socket the IPC server listens on. */
  socketPath: string;
  /** Absolute path to the on-disk SQLite event log database file. */
  databasePath: string;
  graphId: GraphId;
  deviceId: DeviceId;
  /**
   * When true, the host uses an in-memory EventLogStore instead of
   * createSQLiteEventLog. For tests only -- state does not persist across
   * restarts.
   */
  ephemeral: boolean;
}>;

export type DaemonConfigOverrides = Readonly<{
  socketPath?: string;
  databasePath?: string;
  graphId?: string;
  deviceId?: string;
  ephemeral?: boolean;
}>;

// Prefers XDG_RUNTIME_DIR (typically tmpfs, per-user, cleared on logout -- see
// design.md's security/isolation analysis) and falls back to a user-private
// directory when it is unset (e.g. macOS, some containers).
const resolveRuntimeDirectory = (environment: Readonly<NodeJS.ProcessEnv>): string => {
  const xdgRuntimeDirectory = environment.XDG_RUNTIME_DIR;
  return xdgRuntimeDirectory && xdgRuntimeDirectory.trim().length > 0
    ? path.join(xdgRuntimeDirectory, 'canopy')
    : path.join(os.homedir(), '.canopy', 'run');
};

const resolveDataDirectory = (environment: Readonly<NodeJS.ProcessEnv>): string => {
  const xdgDataHome = environment.XDG_DATA_HOME;
  return xdgDataHome && xdgDataHome.trim().length > 0
    ? path.join(xdgDataHome, 'canopy')
    : path.join(os.homedir(), '.canopy', 'data');
};

const resolveEphemeral = (
  overrides: DaemonConfigOverrides,
  environment: Readonly<NodeJS.ProcessEnv>,
): boolean => {
  if (overrides.ephemeral !== undefined) return overrides.ephemeral;
  const raw = environment.CANOPY_DAEMON_EPHEMERAL;
  return raw === '1' || raw === 'true';
};

/**
 * Resolves the daemon's boot configuration from explicit overrides (e.g. CLI
 * flags), falling back to environment variables, then defaults. Never
 * throws -- returns a Result so callers (index.ts) can fail the boot Effect
 * cleanly.
 */
export const resolveDaemonConfig = (
  overrides: DaemonConfigOverrides = {},
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): Result<DaemonConfig, DaemonConfigError> => {
  const socketPath =
    overrides.socketPath?.trim() ||
    environment.CANOPY_SOCKET_PATH?.trim() ||
    path.join(resolveRuntimeDirectory(environment), DEFAULT_SOCKET_FILE_NAME);
  if (!path.isAbsolute(socketPath)) {
    return err(daemonConfigError(`Socket path must be an absolute path: ${socketPath}`));
  }

  const databasePath =
    overrides.databasePath?.trim() ||
    environment.CANOPY_DB_PATH?.trim() ||
    path.join(resolveDataDirectory(environment), DEFAULT_DATABASE_FILE_NAME);
  if (!path.isAbsolute(databasePath)) {
    return err(daemonConfigError(`Database path must be an absolute path: ${databasePath}`));
  }

  const graphIdSource = overrides.graphId?.trim() || environment.CANOPY_GRAPH_ID?.trim();
  const graphId = asGraphId(graphIdSource || DEFAULT_GRAPH_ID);

  // Unlike graphId, deviceId identity does not need to survive restarts for
  // correctness (GraphSession stamps every commit with the session's own
  // deviceId regardless of who asked); a fresh id per process boot is a
  // reasonable default, overridable for callers that want stable attribution.
  const deviceIdSource = overrides.deviceId?.trim() || environment.CANOPY_DEVICE_ID?.trim();
  const deviceId = deviceIdSource ? asDeviceId(deviceIdSource) : createDeviceId();

  return ok({
    socketPath,
    databasePath,
    graphId,
    deviceId,
    ephemeral: resolveEphemeral(overrides, environment),
  });
};
