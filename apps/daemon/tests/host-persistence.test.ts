import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import {
  cleanupTemporarySocketPath,
  connect,
  createDaemonChild,
  getTemporarySocketPath,
  makeJsonRpcTestClient,
  waitForChildExit,
  waitForSocketFile,
} from './test-support';

const daemonRoot = path.join(import.meta.dir, '..');

describe('daemon host persistence', () => {
  let child: ReturnType<typeof Bun.spawn> | undefined;
  let socketPath: string;

  afterEach(async () => {
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      await waitForChildExit(child, 5000);
    }
    child = undefined;
    if (socketPath) cleanupTemporarySocketPath(socketPath);
  });

  it('reads a mutation committed through IPC after restart on the same SQLite file', async () => {
    socketPath = getTemporarySocketPath('persist');
    const databasePath = path.join(path.dirname(socketPath), 'graph.sqlite');
    child = createDaemonChild(daemonRoot, socketPath, databasePath);
    await waitForSocketFile(socketPath);

    const socket = await connect(socketPath);
    const client = makeJsonRpcTestClient(socket);
    const created = await client.send('canopy.v1.mutation.createNode', {
      id: 'node_restart_persistence',
      type: 'concept',
      properties: { title: 'Persisted through daemon restart' },
    });
    expect(created.error).toBeUndefined();
    expect(created.result?.id).toBe('node_restart_persistence');

    child.kill('SIGTERM');
    expect(await waitForChildExit(child, 10_000)).toBe(0);
    expect(fs.existsSync(socketPath)).toBe(false);
    socket.destroy();
    child = undefined;

    const restartedSocketPath = path.join(path.dirname(socketPath), 's-restart.sock');
    child = createDaemonChild(daemonRoot, restartedSocketPath, databasePath);
    await waitForSocketFile(restartedSocketPath);
    const restartedSocket = await connect(restartedSocketPath);
    const restartedClient = makeJsonRpcTestClient(restartedSocket);
    const fetched = await restartedClient.send('canopy.v1.query.getNode', {
      id: 'node_restart_persistence',
    });

    expect(fetched.error).toBeUndefined();
    expect(fetched.result?.id).toBe('node_restart_persistence');
    expect(fetched.result?.properties).toEqual({ title: 'Persisted through daemon restart' });
    restartedSocket.destroy();
  }, 30_000);
});
