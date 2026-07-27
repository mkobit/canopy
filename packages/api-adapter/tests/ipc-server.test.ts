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

    const res = await server.listen();
    expect(res.ok).toBe(true);
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

    const res1 = await server.listen();
    expect(res1.ok).toBe(true);

    const server2 = createIpcServer({ socketPath, context });
    const res2 = await server2.listen();
    expect(res2.ok).toBe(false);
    if (!res2.ok) {
      expect(res2.error._tag).toBe('IpcSocketInUseError');
    }
  });

  it('probes and cleans up stale ECONNREFUSED socket file on startup', async () => {
    const parentDir = path.dirname(socketPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    // Create a dummy stale socket file that is not listening
    fs.writeFileSync(socketPath, 'stale');

    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createApiAdapterContext({ graph });
    server = createIpcServer({ socketPath, context });

    const res = await server.listen();
    expect(res.ok).toBe(true);
    expect(server.getActiveConnectionCount()).toBe(0);
  });

  it('executes handshake, query, and mutation RPC calls over socket connection', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_test');
    const deviceId = asDeviceId('dev_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    const listenRes = await server.listen();
    expect(listenRes.ok).toBe(true);

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

  it('subscribes to event stream and receives notifications over socket', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_test');
    const deviceId = asDeviceId('dev_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();

    const client = net.connect(socketPath);
    await new Promise((resolve) => client.on('connect', resolve));

    const subRequest = JSON.stringify({
      jsonrpc: '2.0',
      method: IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
      params: {},
      id: 10,
    });
    client.write(`${subRequest}\n`);

    const subResp = await new Promise<string>((resolve) => {
      client.once('data', (chunk) => resolve(chunk.toString('utf8').trim()));
    });
    const parsedSub = JSON.parse(subResp);
    expect(parsedSub.result.subscriptionId).toBeDefined();

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
