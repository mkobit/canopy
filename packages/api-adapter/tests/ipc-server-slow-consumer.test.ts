import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createGraphAccessContext } from '@canopy/graph-access';
import { IPC_METHODS, createIpcServer } from '../src/ipc';
import type { IpcServer } from '../src/ipc';

type JsonRpcLine = Readonly<{
  id?: number;
  result?: unknown;
  method?: string;
  params?: unknown;
}>;

const onEachLine = (socket: net.Socket, handleLine: (line: JsonRpcLine) => void): void => {
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) handleLine(JSON.parse(line) as JsonRpcLine);
      newlineIndex = buffer.indexOf('\n');
    }
  });
};

const connect = async (socketPath: string): Promise<net.Socket> => {
  const socket = net.connect(socketPath);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return socket;
};

const waitUntil = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = performance.now() + timeoutMs;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error('Timed out waiting for IPC condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const eventId = (line: JsonRpcLine): string | undefined => {
  if (line.method !== IPC_METHODS.EVENT_STREAM_EVENT) return undefined;
  const parameters = line.params as Readonly<{ event?: Readonly<{ id?: string }> }> | undefined;
  return parameters?.event?.id;
};

describe('IPC slow-consumer isolation', () => {
  let server: IpcServer | undefined;
  let slowSocket: net.Socket | undefined;
  let fastSocket: net.Socket | undefined;
  let writer: net.Socket | undefined;
  let socketPath = '';
  let testDirectory = '';

  afterEach(async () => {
    slowSocket?.destroy();
    fastSocket?.destroy();
    writer?.destroy();
    slowSocket = undefined;
    fastSocket = undefined;
    writer = undefined;
    if (server) {
      await server.close();
      server = undefined;
    }
    if (!testDirectory) return;
    fs.rmSync(testDirectory, { recursive: true, force: true });
    testDirectory = '';
  });

  it('ends only the paused subscriber after the 15-second drain timeout', async () => {
    testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-'));
    socketPath = path.join(testDirectory, 's.sock');
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_slow_consumer');
    const deviceId = asDeviceId('device_slow_consumer');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createGraphAccessContext({ graph: session.graph(), session, eventLogStore });
    server = createIpcServer({ socketPath, context });
    await server.listen();

    const slowClient = await connect(socketPath);
    slowSocket = slowClient;
    let slowEventCount = 0;
    onEachLine(slowClient, (line) => {
      if (eventId(line)) slowEventCount += 1;
    });
    const slowAck = new Promise<void>((resolve) => {
      onEachLine(slowClient, (line) => {
        if (line.id === 1 && line.result !== undefined) resolve();
      });
    });
    slowClient.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
        params: {},
        id: 1,
      })}\n`,
    );
    await slowAck;
    let slowClosed = false;
    const slowClosedPromise = new Promise<void>((resolve) =>
      slowClient.once('close', () => {
        slowClosed = true;
        resolve();
      }),
    );
    slowClient.pause();

    const fastClient = await connect(socketPath);
    fastSocket = fastClient;
    const fastEventIds: string[] = [];
    let fastAckReceived = false;
    onEachLine(fastClient, (line) => {
      if (line.id === 1 && line.result !== undefined) fastAckReceived = true;
      const receivedId = eventId(line);
      if (receivedId) fastEventIds.push(receivedId);
    });
    fastClient.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
        params: {},
        id: 1,
      })}\n`,
    );
    await waitUntil(() => fastAckReceived, 2000);

    const mutationWriter = await connect(socketPath);
    writer = mutationWriter;
    await waitUntil(() => server?.getActiveConnectionCount() === 3, 2000);
    expect(server.getActiveConnectionCount()).toBe(3);
    const pending = new Map<number, (line: JsonRpcLine) => void>();
    onEachLine(mutationWriter, (line) => {
      if (typeof line.id === 'number') pending.get(line.id)?.(line);
    });
    const sendMutation = (id: number, nodeId: string): Promise<JsonRpcLine> =>
      new Promise((resolve) => {
        pending.set(id, resolve);
        mutationWriter.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: IPC_METHODS.MUTATION_CREATE_NODE,
            params: { id: nodeId, type: 'concept', properties: {} },
            id,
          })}\n`,
        );
      });

    const burstEventCount = 8;
    const nodeIds = Array.from(
      { length: burstEventCount },
      (_, index) => `node_backpressure_${index}_${'x'.repeat(256 * 1024)}`,
    );
    const burstStartedAt = performance.now();
    const burst = await Promise.all(
      nodeIds.map((nodeId, index) => sendMutation(index + 1, nodeId)),
    );
    expect(burst.every((mutation) => mutation.result !== undefined)).toBe(true);
    await waitUntil(() => fastEventIds.length === burstEventCount, 15_000);
    expect(slowClient.isPaused()).toBe(true);
    expect(slowClient.readableLength).toBeGreaterThan(0);

    await waitUntil(() => server?.getActiveConnectionCount() === 2, 20_000);
    expect(server.getActiveConnectionCount()).toBe(2);
    expect(slowClosed).toBe(false);
    expect(performance.now() - burstStartedAt).toBeGreaterThanOrEqual(15_000);
    slowClient.resume();
    await slowClosedPromise;
    const slowEventCountAtClose = slowEventCount;

    const laterMutation = await sendMutation(burstEventCount + 1, 'node_backpressure_later');
    expect(laterMutation.result).toBeDefined();
    await waitUntil(() => fastEventIds.length === burstEventCount + 1, 2000);
    expect(new Set(fastEventIds).size).toBe(burstEventCount + 1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(slowEventCount).toBe(slowEventCountAtClose);
  }, 60_000);
});
