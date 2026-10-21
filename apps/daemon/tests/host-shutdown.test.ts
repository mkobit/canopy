import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import {
  cleanupTemporarySocketPath,
  createDaemonChild,
  getTemporarySocketPath,
  makeJsonRpcTestClient,
  waitForChildExit,
  waitForSocketFile,
} from './test-support';

const daemonRoot = path.join(import.meta.dir, '..');

describe('daemon host shutdown', () => {
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

  const assertSignalShutdown = async (signal: 'SIGINT' | 'SIGTERM'): Promise<void> => {
    socketPath = getTemporarySocketPath(`shutdown-${signal}`);
    child = createDaemonChild(daemonRoot, socketPath);
    await waitForSocketFile(socketPath);

    const socket = net.connect(socketPath);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    let deliveredEvents = 0;
    socket.on('data', (chunk: Buffer) => {
      deliveredEvents += chunk.toString('utf8').split('canopy.v1.eventStream.event').length - 1;
    });
    const client = makeJsonRpcTestClient(socket);
    const subscription = await client.send('canopy.v1.eventStream.subscribe');
    expect(subscription.error).toBeUndefined();
    const mutation = await client.send('canopy.v1.mutation.createNode', {
      id: 'node_shutdown_subscription',
      type: 'concept',
      properties: { title: 'Subscription is active before shutdown' },
    });
    expect(mutation.error).toBeUndefined();
    const eventDeadline = performance.now() + 2000;
    while (deliveredEvents === 0 && performance.now() < eventDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(deliveredEvents).toBe(1);
    const closed = new Promise<void>((resolve) => socket.once('close', resolve));

    child.kill(signal);
    const [exitCode] = await Promise.all([waitForChildExit(child, 10_000), closed]);
    expect(exitCode).toBe(0);
    expect(socket.destroyed).toBe(true);
    expect(fs.existsSync(socketPath)).toBe(false);
    const eventCountAtClose = deliveredEvents;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(deliveredEvents).toBe(eventCountAtClose);
  };

  it('closes a connected client and live subscription on SIGINT', async () => {
    await assertSignalShutdown('SIGINT');
  }, 15_000);

  it('closes a connected client and live subscription on SIGTERM', async () => {
    await assertSignalShutdown('SIGTERM');
  }, 15_000);
});
