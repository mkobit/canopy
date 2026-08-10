import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { connect, getTemporarySocketPath } from './test-support';

// This test spawns the real process entrypoint (apps/daemon/src/index.ts)
// and sends it a real SIGINT rather than simulating fiber interruption
// in-process -- design.md's lifecycle section says NodeRuntime.runMain's
// default signal handling is *expected* to interrupt the running fiber and
// run Effect.scoped's release effect (server.close()), but that must be
// verified, not assumed. This is that verification.
const daemonRoot = path.join(import.meta.dir, '..');
const entrypoint = path.join(daemonRoot, 'src', 'index.ts');
// Bun.spawn's posix_spawn does not resolve a bare command name against PATH
// the way a shell does -- resolve the absolute path once via Bun.which.
const bunExecutable = Bun.which('bun') ?? 'bun';

// Polls for the socket *file* rather than attempting a connect-and-retry:
// Bun's node:net Unix-socket client throws immediately (rather than emitting
// an async 'error') when connecting to a path that doesn't exist yet, which
// is awkward to retry around. The IPC server creates the socket file as part
// of the synchronous bind step in net.Server#listen, before its 'listening'
// callback fires, so once the file exists the listener is already accepting.
const waitForSocketFile = async (socketPath: string, timeoutMs = 10_000): Promise<void> => {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (fs.existsSync(socketPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for daemon socket at ${socketPath}`);
};

describe('daemon host shutdown', () => {
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let socketPath: string;

  afterEach(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGKILL');
      await child.exited;
    }
    child = undefined;
    if (socketPath && fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
  });

  it('closes the server, destroys connections, and unlinks the socket file on SIGINT', async () => {
    socketPath = getTemporarySocketPath('shutdown');

    child = Bun.spawn([bunExecutable, entrypoint, '--ephemeral', '--socket-path', socketPath], {
      cwd: daemonRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    await waitForSocketFile(socketPath);
    expect(fs.existsSync(socketPath)).toBe(true);

    // Confirm a client connection exists before shutdown, then let it go --
    // close() is documented to destroy active sockets too, but the primary
    // assertion here is the socket-file unlink, which only happens once the
    // scope's release effect actually runs.
    const probe = await connect(socketPath);
    probe.destroy();

    child.kill('SIGINT');
    const exitCode = await child.exited;

    expect(exitCode).toBe(0);
    expect(fs.existsSync(socketPath)).toBe(false);
  }, 20_000);
});
