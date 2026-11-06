import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  asDeviceId,
  asEdgeId,
  asEventId,
  asGraphId,
  asInstant,
  asNodeId,
  asTypeId,
  createGraph,
  createGraphSession,
  unwrap,
} from '@canopy/graph';
import type { GraphEvent, PropertyValue } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { createGraphAccessContext } from '@canopy/graph-access';
import { Effect } from 'effect';
import { IPC_METHODS, createIpcServer, deserializeIpcGraphEvent, makeIpcClient } from '../src/ipc';
import type { IpcGraphEvent, IpcServer } from '../src/ipc';

describe('IpcServer integration and socket lifecycle', () => {
  let server: IpcServer | undefined;
  let temporaryDirectory: string;
  let socketPath: string;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'canopy-ipc-server-'));
    socketPath = path.join(temporaryDirectory, 'test.sock');
  });

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('starts server and creates socket file with umask permissions', async () => {
    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createGraphAccessContext({ graph });
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
    const context = createGraphAccessContext({ graph });
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
    const context = createGraphAccessContext({ graph });
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
    const context = createGraphAccessContext({ graph: session.graph(), session, eventLogStore });

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
    const context = createGraphAccessContext({ graph: session.graph(), session, eventLogStore });

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
          if (Temporal.Now.instant().epochMilliseconds - start > 2000) {
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
      pushNotification.params as Readonly<{
        event: Readonly<{
          type: string;
          id: string;
          properties: Readonly<Record<string, unknown>>;
        }>;
      }>
    ).event;
    expect(pushedEvent.type).toBe('NodeCreated');
    expect(pushedEvent.id).toBe('node_push_test');
    expect(pushedEvent.properties).toEqual({ title: 'Push Test' });

    client.destroy();
  });

  it('preserves property maps, falsy scalars, ExternalReference, arrays, optional batchId/migrationId, and __proto__ across all GraphEvent variants over a live Unix socket', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('00000000-0000-4000-8000-000000000100');
    const deviceId = asDeviceId('00000000-0000-4000-8000-000000000200');
    const externalGraphId = asGraphId('00000000-0000-4000-8000-000000000300');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createGraphAccessContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    const listenResult = await server.listen();
    expect(listenResult.ok).toBe(true);

    const receivedEvents: IpcGraphEvent[] = [];
    const { promise: allEventsReceived, resolve: resolveAllEvents } =
      Promise.withResolvers<undefined>();

    const timestamp = asInstant('2026-11-04T00:00:00.000Z');
    const initialNodeProperties = new Map<string, PropertyValue>([
      ['title', 'Initial Node'],
      ['emptyString', ''],
      ['zero', 0],
      ['boolFalse', false],
      ['nullProp', null],
      ['externalRef', { graph: externalGraphId, target: asNodeId('ext-target-1') }],
      [
        'mixedArray',
        ['item', 0, false, null, { graph: externalGraphId, target: asNodeId('ext-target-2') }],
      ],
      ['__proto__', 'proto-safe-value'],
    ]);

    const committedEvents: readonly GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: asEventId('00000000-0000-4000-8000-000000000011'),
        id: asNodeId('node-roundtrip-1'),
        nodeType: asTypeId('concept'),
        properties: initialNodeProperties,
        timestamp,
        deviceId,
        batchId: 'batch-alpha',
        migrationId: 'mig-1',
      },
      {
        type: 'NodeCreated',
        eventId: asEventId('00000000-0000-4000-8000-000000000012'),
        id: asNodeId('node-roundtrip-2'),
        nodeType: asTypeId('concept'),
        properties: new Map<string, PropertyValue>([['title', 'Second Node']]),
        timestamp,
        deviceId,
      },
      {
        type: 'NodePropertiesUpdated',
        eventId: asEventId('00000000-0000-4000-8000-000000000013'),
        id: asNodeId('node-roundtrip-1'),
        changes: new Map<string, PropertyValue>([
          ['title', 'Updated Title'],
          ['zero', 0],
          ['boolFalse', false],
          ['__proto__', 'updated-proto-value'],
        ]),
        timestamp,
        deviceId,
        batchId: 'batch-beta',
      },
      {
        type: 'EdgeCreated',
        eventId: asEventId('00000000-0000-4000-8000-000000000014'),
        id: asEdgeId('edge-roundtrip-1'),
        edgeType: asTypeId('related-to'),
        source: asNodeId('node-roundtrip-1'),
        target: asNodeId('node-roundtrip-2'),
        properties: new Map<string, PropertyValue>([
          ['weight', 0],
          ['active', false],
          ['label', ''],
          ['ref', { graph: externalGraphId, target: asNodeId('ext-target-3') }],
        ]),
        timestamp,
        deviceId,
        migrationId: 'mig-edge',
      },
      {
        type: 'EdgePropertiesUpdated',
        eventId: asEventId('00000000-0000-4000-8000-000000000015'),
        id: asEdgeId('edge-roundtrip-1'),
        changes: new Map<string, PropertyValue>([
          ['weight', 42],
          ['tags', ['a', 'b']],
          ['nullChange', null],
        ]),
        timestamp,
        deviceId,
      },
      {
        type: 'WorkflowStarted',
        eventId: asEventId('00000000-0000-4000-8000-000000000016'),
        workflowId: asNodeId('node-roundtrip-1'),
        triggerId: asNodeId('node-roundtrip-2'),
        timestamp,
        deviceId,
        batchId: 'batch-workflow',
      },
      {
        type: 'WorkflowCompleted',
        eventId: asEventId('00000000-0000-4000-8000-000000000017'),
        executionId: asEventId('00000000-0000-4000-8000-000000000016'),
        timestamp,
        deviceId,
      },
      {
        type: 'EdgeDeleted',
        eventId: asEventId('00000000-0000-4000-8000-000000000018'),
        id: asEdgeId('edge-roundtrip-1'),
        timestamp,
        deviceId,
      },
      {
        type: 'NodeDeleted',
        eventId: asEventId('00000000-0000-4000-8000-000000000019'),
        id: asNodeId('node-roundtrip-2'),
        timestamp,
        deviceId,
      },
    ];

    const client = await Effect.runPromise(makeIpcClient(socketPath));
    await Effect.runPromise(
      client.subscribe({}, (event) => {
        receivedEvents.push(event);
        if (receivedEvents.length === committedEvents.length) {
          resolveAllEvents(undefined);
        }
      }),
    );

    const commitResult = await session.commit(committedEvents);
    expect(commitResult.ok).toBe(true);

    await allEventsReceived;
    expect(receivedEvents.length).toBe(committedEvents.length);

    const firstReceived = receivedEvents[0];
    expect(firstReceived?.type).toBe('NodeCreated');
    if (firstReceived?.type === 'NodeCreated') {
      expect(firstReceived.properties.title).toBe('Initial Node');
      expect(firstReceived.properties.emptyString).toBe('');
      expect(firstReceived.properties.zero).toBe(0);
      expect(firstReceived.properties.boolFalse).toBe(false);
      expect(firstReceived.properties.nullProp).toBeNull();
      expect(Object.getOwnPropertyDescriptor(firstReceived.properties, '__proto__')?.value).toBe(
        'proto-safe-value',
      );
    }

    for (const [index, originalEvent] of committedEvents.entries()) {
      const wireEvent = receivedEvents[index];
      const decoded = deserializeIpcGraphEvent(wireEvent);
      expect(decoded.ok).toBe(true);
      if (decoded.ok) {
        expect(decoded.value).toEqual(originalEvent);
      }
    }

    await Effect.runPromise(client.close());
  });

  it('supports additive properties in request and response schemas', async () => {
    const graph = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
    const context = createGraphAccessContext({ graph });

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
