import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { resolveDaemonConfig } from '../src/config';
import type { RunningHost } from '../src/host';
import { startHost } from '../src/host';
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

describe('daemon host second-listener rejection', () => {
  let firstHost: RunningHost | undefined;
  let secondHost: RunningHost | undefined;
  let incumbentChild: ReturnType<typeof Bun.spawn> | undefined;
  let failedChild: ReturnType<typeof Bun.spawn> | undefined;
  let replacementChild: ReturnType<typeof Bun.spawn> | undefined;
  let socketPath: string;

  afterEach(async () => {
    if (secondHost) {
      await secondHost.close();
      secondHost = undefined;
    }
    if (firstHost) {
      await firstHost.close();
      firstHost = undefined;
    }
    const childCleanup = await Promise.allSettled(
      [incumbentChild, failedChild, replacementChild].map(async (child) => {
        if (!child || child.exitCode !== null) return;
        child.kill('SIGTERM');
        await waitForChildExit(child, 5000);
      }),
    );
    if (socketPath) cleanupTemporarySocketPath(socketPath);
    expect(childCleanup.filter((result) => result.status === 'rejected')).toEqual([]);
  });

  it('fails fast with IpcSocketInUseError and does not bind a second listener on the same socket path', async () => {
    socketPath = getTemporarySocketPath('second-listener');
    const configResult = resolveDaemonConfig({ socketPath, ephemeral: true });
    expect(configResult.ok).toBe(true);
    if (!configResult.ok) return;

    const firstResult = await startHost(configResult.value);
    expect(firstResult.ok).toBe(true);
    if (!firstResult.ok) return;
    firstHost = firstResult.value;

    expect(firstHost.getActiveConnectionCount()).toBe(0);

    const secondResult = await startHost(configResult.value);
    expect(secondResult.ok).toBe(false);
    if (secondResult.ok) return;
    expect(secondResult.error._tag).toBe('IpcSocketInUseError');

    // The rejected second attempt must not have bound a listener -- the
    // first host's socket is still the only one live.
    expect(fs.existsSync(socketPath)).toBe(true);
  });

  it('closes SQLite after a child listen failure and lets a new child reuse the database', async () => {
    socketPath = getTemporarySocketPath('occupied');
    const databasePath = path.join(path.dirname(socketPath), 'graph.sqlite');
    incumbentChild = createDaemonChild(daemonRoot, socketPath, databasePath);
    await waitForSocketFile(socketPath);
    const incumbentSocket = await connect(socketPath);
    const incumbentClient = makeJsonRpcTestClient(incumbentSocket);

    failedChild = createDaemonChild(daemonRoot, socketPath, databasePath);
    const failedExitCode = await waitForChildExit(failedChild, 10_000);
    expect(failedExitCode).not.toBe(0);
    const failedOutput =
      failedChild.stdout instanceof ReadableStream
        ? await new Response(failedChild.stdout).text()
        : '';
    expect(failedOutput).toContain(`IPC socket path is already in use: ${socketPath}`);
    expect(fs.existsSync(socketPath)).toBe(true);
    const incumbentResponse = await incumbentClient.send('canopy.v1.handshake', {
      clientVersion: '0.1.0',
    });
    expect(incumbentResponse.error).toBeUndefined();
    expect(incumbentResponse.result?.apiVersion).toBe('v1');

    incumbentChild.kill('SIGTERM');
    expect(await waitForChildExit(incumbentChild, 10_000)).toBe(0);
    incumbentSocket.destroy();
    incumbentChild = undefined;

    const replacementSocketPath = path.join(path.dirname(socketPath), 's-reuse.sock');
    replacementChild = createDaemonChild(daemonRoot, replacementSocketPath, databasePath);
    await waitForSocketFile(replacementSocketPath);
    const replacementSocket = await connect(replacementSocketPath);
    const replacementClient = makeJsonRpcTestClient(replacementSocket);
    const replacementResponse = await replacementClient.send('canopy.v1.handshake', {
      clientVersion: '0.1.0',
    });
    expect(replacementResponse.error).toBeUndefined();
    expect(replacementResponse.result?.apiVersion).toBe('v1');
    replacementSocket.destroy();
  }, 30_000);
});
