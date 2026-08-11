import * as os from 'node:os';
import * as path from 'node:path';

const DEFAULT_SOCKET_FILE_NAME = 'canopy.sock';

// Mirrors apps/daemon/src/config.ts's resolveRuntimeDirectory: prefers
// XDG_RUNTIME_DIR (typically tmpfs, per-user, cleared on logout) and falls
// back to a user-private directory when unset (e.g. macOS, some containers).
// Duplicated rather than shared -- the daemon's resolver is bundled with
// database/graphId/deviceId config this host has no use for.
const resolveRuntimeDirectory = (environment: Readonly<NodeJS.ProcessEnv>): string => {
  const xdgRuntimeDirectory = environment.XDG_RUNTIME_DIR;
  return xdgRuntimeDirectory && xdgRuntimeDirectory.trim().length > 0
    ? path.join(xdgRuntimeDirectory, 'canopy')
    : path.join(os.homedir(), '.canopy', 'run');
};

/**
 * Resolves the daemon's Unix domain socket path the same way apps/daemon
 * resolves it: an explicit override, then CANOPY_SOCKET_PATH, then the
 * XDG-runtime-dir default.
 */
export const resolveDaemonSocketPath = (
  overrideSocketPath?: string,
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
): string =>
  overrideSocketPath?.trim() ||
  environment.CANOPY_SOCKET_PATH?.trim() ||
  path.join(resolveRuntimeDirectory(environment), DEFAULT_SOCKET_FILE_NAME);
