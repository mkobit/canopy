import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraph, createGraphSession, unwrap } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Temporal } from 'temporal-polyfill';
import { createApiAdapterContext } from '../src/api-context';
import { IPC_METHODS, createIpcServer } from '../src/ipc';
import type { IpcServer } from '../src/ipc';

const getSocketPath = (): string =>
  path.join(
    process.cwd(),
    'tmp',
    `test-ipc-${Temporal.Now.instant().epochMilliseconds}-${Math.random().toString(36).slice(2, 7)}.sock`,
  );

describe('IpcServer integration and socket lifecycle', () => {
  let server: IpcServer | undefined;
  let socketPath: string;

  beforeEach(() => {
    socketPath = getSocketPath();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    if (fs.existsSync(socketPath)) {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Ignore
      }
    }
  });

  it('starts server and creates socket file with umask permissions', async () => {
    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createApiAdapterContext({ graph });
    server = createIpcServer({ socketPath, context });

    const result = await server.listen();
    expect(result.ok).toBe(true);
    expect(fs.existsSync(socketPath)).toBe(true);

    const stat = fs.statSync(socketPath);
    // Socket file mode should be 0o140600 (socket + 0o600 permissions due to 0o177 umask)
    const permissions = stat.mode & 0o777;
    expect(permissions).toBe(0o600);
  });

  it('detects active listener and returns IpcSocketInUseError', async () => {
    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createApiAdapterContext({ graph });
    server = createIpcServer({ socketPath, context });

    const result1 = await server.listen();
    expect(result1.ok).toBe(true);

    const server2 = createIpcServer({ socketPath, context });
    const result2 = await server2.listen();
    expect(result2.ok).toBe(false);
    if (!result2.ok) {
      expect(result2.error._tag).toBe('IpcSocketInUseError');
    }
  });

  it('probes and cleans up stale ECONNREFUSED socket file on startup', async () => {
    const parentDirectory = path.dirname(socketPath);
    if (!fs.existsSync(parentDirectory)) {
      fs.mkdirSync(parentDirectory, { recursive: true });
    }
    // Create a dummy stale socket file that is not listening
    fs.writeFileSync(socketPath, 'stale');

    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createApiAdapterContext({ graph });
    server = createIpcServer({ socketPath, context });

    const result = await server.listen();
    expect(result.ok).toBe(true);
    expect(server.getActiveConnectionCount()).toBe(0);
  });

  it('executes handshake, query, and mutation RPC calls over socket connection', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_test');
    const deviceId = asDeviceId('dev_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    const listenResult = await server.listen();
    expect(listenResult.ok).toBe(true);

    const client = net.connect(socketPath);
    await new Promise((resolve) => client.on('connect', resolve));

    // 1. Handshake
    const handshakeRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: IPC_METHODS.HANDSHAKE,
      params: { clientVersion: '0.1.0' },
      id: 1,
    });
    client.write(`${handshakeRequest}\n`);

    const response1 = await new Promise<string>((resolve) => {
      client.once('data', (chunk) => resolve(chunk.toString('utf8').trim()));
    });
    const parsed1 = JSON.parse(response1);
    expect(parsed1.id).toBe(1);
    expect(parsed1.result.apiVersion).toBe('v1');
    expect(parsed1.result.capabilities).toContain('queries');

    // 2. Mutation: createNode
    const createNodeRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: IPC_METHODS.MUTATION_CREATE_NODE,
      params: {
        id: 'node_test_1',
        type: 'concept',
        properties: { title: 'IPC Test Node' },
      },
      id: 2,
    });
    client.write(`${createNodeRequest}\n`);

    const response2 = await new Promise<string>((resolve) => {
      client.once('data', (chunk) => resolve(chunk.toString('utf8').trim()));
    });
    const parsed2 = JSON.parse(response2);
    expect(parsed2.id).toBe(2);
    expect(parsed2.result.id).toBe('node_test_1');

    // 3. Query: getNode
    const getNodeRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: IPC_METHODS.QUERY_GET_NODE,
      params: { id: 'node_test_1' },
      id: 3,
    });
    client.write(`${getNodeRequest}\n`);

    const response3 = await new Promise<string>((resolve) => {
      client.once('data', (chunk) => resolve(chunk.toString('utf8').trim()));
    });
    const parsed3 = JSON.parse(response3);
    expect(parsed3.id).toBe(3);
    expect(parsed3.result.id).toBe('node_test_1');

    client.destroy();
  });

  it('subscribes to event stream and pushes event notifications over the socket on mutation commit', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_test');
    const deviceId = asDeviceId('dev_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();

    const client = net.connect(socketPath);
    await new Promise((resolve) => client.on('connect', resolve));

    const messages: unknown[] = [];
    let buffer = '';
    client.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line.length > 0) {
          messages.push(JSON.parse(line));
        }
        newlineIndex = buffer.indexOf('\n');
      }
    });

    const waitForMessage = (
      predicate: (message: Readonly<Record<string, unknown>>) => boolean,
      timeoutMs = 2000,
    ): Promise<Readonly<Record<string, unknown>>> =>
      new Promise((resolve, reject) => {
        const start = Temporal.Now.instant().epochMilliseconds;
        const check = (): void => {
          const found = messages.find((message) =>
            predicate(message as Readonly<Record<string, unknown>>),
          );
          if (found) {
            resolve(found as Readonly<Record<string, unknown>>);
            return;
          }
          if (Temporal.Now.instant().epochMilliseconds - start > timeoutMs) {
            reject(new Error('Timed out waiting for expected IPC message'));
            return;
          }
          setTimeout(check, 10);
        };
        check();
      });

    client.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
        params: {},
        id: 10,
      })}\n`,
    );

    const subResp = await waitForMessage((message) => message.id === 10);
    const subscriptionId = (subResp.result as Readonly<{ subscriptionId: string }>).subscriptionId;
    expect(subscriptionId).toBeDefined();

    client.write(
      `${JSON.stringify({
        jsonrpc: '2.0',
        method: IPC_METHODS.MUTATION_CREATE_NODE,
        params: { id: 'node_push_test', type: 'concept', properties: { title: 'Push Test' } },
        id: 11,
      })}\n`,
    );

    const pushNotification = await waitForMessage(
      (message) =>
        message.method === IPC_METHODS.EVENT_STREAM_EVENT &&
        (message.params as Readonly<{ subscriptionId?: string }> | undefined)?.subscriptionId ===
          subscriptionId,
    );

    const pushedEvent = (
      pushNotification.params as Readonly<{ event: Readonly<{ type: string; id: string }> }>
    ).event;
    expect(pushedEvent.type).toBe('NodeCreated');
    expect(pushedEvent.id).toBe('node_push_test');

    client.destroy();
  });

  it('supports additive properties in request and response schemas', async () => {
    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createApiAdapterContext({ graph });

    server = createIpcServer({ socketPath, context });
    await server.listen();

    const client = net.connect(socketPath);
    await new Promise((resolve) => client.on('connect', resolve));

    const additiveRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: IPC_METHODS.HANDSHAKE,
      params: { clientVersion: '0.1.0', futureOption: 'additive' },
      id: 99,
      clientTraceId: 'trace-12345',
    });
    client.write(`${additiveRequest}\n`);

    const resp = await new Promise<string>((resolve) => {
      client.once('data', (chunk) => resolve(chunk.toString('utf8').trim()));
    });
    const parsed = JSON.parse(resp);
    expect(parsed.id).toBe(99);
    expect(parsed.result.apiVersion).toBe('v1');

    client.destroy();
  });
});
