import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { asDeviceId, asGraphId, asNodeId, asTypeId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Effect, Fiber } from 'effect';
import type { IpcClient, IpcServer } from '../src/ipc';
import { createIpcServer, makeIpcClient } from '../src/ipc';
import { JSON_RPC_ERROR_CODES } from '../src/ipc/ipc-schema';

const getSocketPath = (): string =>
  path.join('/tmp', `canopy-ipc-${process.pid}-${Math.random().toString(36).slice(2, 9)}.sock`);

const rawPeerCleanups = { current: new Set<() => Promise<void>>() };

type RpcRequest = Readonly<{ id: number; method: string; socketIndex: number }>;

type RawPeer = Readonly<{
  readonly requests: readonly RpcRequest[];
  readonly waitForRequests: (count: number) => Promise<void>;
  readonly waitForConnections: (count: number) => Promise<void>;
  readonly waitForClosedConnections: (count: number) => Promise<void>;
  readonly respond: (index: number, result: unknown) => void;
  readonly notify: (socketIndex: number, subscriptionId: string, event: unknown) => void;
  readonly closeClient: (socketIndex?: number) => void;
  readonly close: () => Promise<void>;
}>;

const wakeWaiters = (waiters: { current: (() => unknown)[] }): boolean => {
  const queued = waiters.current;
  waiters.current = [];
  const wakeAt = (index: number): boolean => {
    const wake = queued[index];
    if (wake === undefined) return true;
    wake();
    return wakeAt(index + 1);
  };
  return wakeAt(0);
};

const createRawPeer = async (socketPath: string): Promise<RawPeer> => {
  const peerSockets = { current: [] as net.Socket[] };
  const requests = { current: [] as RpcRequest[] };
  const streamBuffers = { current: new Map<net.Socket, string>() };
  const requestWaiters = { current: [] as (() => unknown)[] };
  const connectionWaiters = { current: [] as (() => unknown)[] };
  const closeWaiters = { current: [] as (() => unknown)[] };
  const closedConnections = { current: 0 };
  let closePromise: Promise<void> | undefined;
  const server = net.createServer((socket) => {
    peerSockets.current = [...peerSockets.current, socket];
    wakeWaiters(connectionWaiters);
    socket.on('error', () => undefined);
    socket.on('close', () => {
      closedConnections.current += 1;
      streamBuffers.current = new Map(
        [...streamBuffers.current].filter(([candidate]) => candidate !== socket),
      );
      wakeWaiters(closeWaiters);
    });
    socket.on('data', (chunk: Buffer) => {
      const combined = (streamBuffers.current.get(socket) ?? '') + chunk.toString('utf8');
      const lines = combined.split('\n');
      streamBuffers.current = new Map([...streamBuffers.current, [socket, lines.pop() ?? '']]);
      const processLines = (index: number): void => {
        const line = lines[index];
        if (line === undefined) return;
        const parsed = JSON.parse(line) as Readonly<{ id: number; method: string }>;
        requests.current = [
          ...requests.current,
          { ...parsed, socketIndex: peerSockets.current.indexOf(socket) },
        ];
        wakeWaiters(requestWaiters);
        processLines(index + 1);
      };
      processLines(0);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });

  const waitForRequests = async (count: number): Promise<void> => {
    if (requests.current.length >= count) return;
    await new Promise<void>((resolve) => {
      requestWaiters.current = [...requestWaiters.current, resolve];
    });
    return waitForRequests(count);
  };

  const waitForConnections = async (count: number): Promise<void> => {
    if (peerSockets.current.length >= count) return;
    await new Promise<void>((resolve) => {
      connectionWaiters.current = [...connectionWaiters.current, resolve];
    });
    return waitForConnections(count);
  };

  const waitForClosedConnections = async (count: number): Promise<void> => {
    if (closedConnections.current >= count) return;
    await new Promise<void>((resolve) => {
      closeWaiters.current = [...closeWaiters.current, resolve];
    });
    return waitForClosedConnections(count);
  };

  const destroySockets = (index = 0): void => {
    const socket = peerSockets.current[index];
    if (socket === undefined) return;
    socket.destroy();
    destroySockets(index + 1);
  };

  const peer: RawPeer = {
    get requests() {
      return requests.current;
    },
    waitForRequests,
    waitForConnections,
    waitForClosedConnections,
    respond: (index, result) => {
      const request = requests.current[index];
      const socket = request && peerSockets.current[request.socketIndex];
      if (!request || !socket) throw new Error('Expected a pending request');
      socket.write(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`);
    },
    notify: (socketIndex, subscriptionId, event) => {
      const socket = peerSockets.current[socketIndex];
      if (!socket) throw new Error('Expected a connected client');
      socket.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          method: 'canopy.v1.eventStream.event',
          params: { subscriptionId, event },
        })}\n`,
      );
    },
    closeClient: (socketIndex = 0) => peerSockets.current[socketIndex]?.end(),
    close: () => {
      if (closePromise) return closePromise;
      closePromise = new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        destroySockets();
      }).finally(() => {
        rawPeerCleanups.current.delete(close);
        if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
      });
      return closePromise;
    },
  };
  const close = (): Promise<void> => peer.close();
  rawPeerCleanups.current.add(close);
  return peer;
};

describe('IpcClient integration with IpcServer', () => {
  let server: IpcServer | undefined;
  let socketPath: string;

  beforeEach(() => {
    socketPath = getSocketPath();
  });

  afterEach(async () => {
    await Promise.all([...rawPeerCleanups.current].map((close) => close()));
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

  it('executes handshake, node mutations, and queries via Effect IpcClient', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_cli_test');
    const deviceId = asDeviceId('dev_cli_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = { graph: session.graph(), session, eventLogStore };

    server = createIpcServer({ socketPath, context });
    const listenResponse = await server.listen();
    expect(listenResponse.ok).toBe(true);

    const program = Effect.gen(function* () {
      const client: IpcClient = yield* makeIpcClient(socketPath);

      const handshakeResponse = yield* client.handshake('0.1.0');
      expect(handshakeResponse.apiVersion).toBe('v1');
      expect(handshakeResponse.capabilities).toContain('queries');

      const createdNode = yield* client.createNode({
        id: 'node_cli_1',
        type: 'task',
        properties: { title: 'CLI Task' },
      });
      expect(createdNode.id).toBe(asNodeId('node_cli_1'));
      expect(createdNode.type).toBe(asTypeId('task'));

      const fetchedNode = yield* client.getNode('node_cli_1');
      expect(fetchedNode.id).toBe(asNodeId('node_cli_1'));
      expect(fetchedNode.properties.title).toBe('CLI Task');

      const allNodes = yield* client.getNodes({ type: 'task' });
      expect(allNodes.length).toBe(1);

      yield* client.close();
    });

    await Effect.runPromise(program);
  });

  it('removes an interrupted request and ignores its late response', async () => {
    const socketPath = `/tmp/canopy-ipc-${process.pid}-${Math.random().toString(36).slice(2, 7)}.sock`;
    const peer = await createRawPeer(socketPath);
    const client = await Effect.runPromise(makeIpcClient(socketPath));
    const interrupted = Effect.runFork(client.getNode('interrupted'));
    await peer.waitForRequests(1);
    const second = Effect.runPromise(Effect.result(client.getNode('second')));
    await peer.waitForRequests(2);
    await Effect.runPromise(Fiber.interrupt(interrupted));
    peer.respond(1, { id: 'second' });
    const secondResult = await second;
    expect(secondResult._tag).toBe('Success');
    peer.respond(0, { id: 'late' });

    const events = { current: [] as unknown[] };
    const subscription = Effect.runPromise(
      client.subscribe({}, (event) => {
        events.current = [...events.current, event];
      }),
    );
    await peer.waitForRequests(3);
    peer.respond(2, { subscriptionId: 'sub-1' });
    await subscription;
    peer.notify(0, 'sub-1', { sequence: 1 });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(events.current).toEqual([{ sequence: 1 }]);

    const unrelatedClient = await Effect.runPromise(makeIpcClient(socketPath));
    const unrelatedRequest = Effect.runPromise(Effect.result(unrelatedClient.handshake()));
    await peer.waitForRequests(4);
    peer.respond(3, { apiVersion: 'v1' });
    const unrelatedResult = await unrelatedRequest;
    expect(unrelatedResult._tag).toBe('Success');
    await Effect.runPromise(client.close());
    await Effect.runPromise(unrelatedClient.close());
    await peer.close();
  });

  it('releases an interrupted connection attempt', async () => {
    const socketPath = `/tmp/canopy-ipc-${process.pid}-${Math.random().toString(36).slice(2, 7)}.sock`;
    const peer = await createRawPeer(socketPath);
    const connection = Effect.runFork(makeIpcClient(socketPath));
    await Effect.runPromise(Fiber.interrupt(connection));
    const exit = await Effect.runPromise(Fiber.await(connection));
    expect(exit._tag).toBe('Failure');
    await peer.waitForConnections(1);
    await peer.waitForClosedConnections(1);

    const client = await Effect.runPromise(makeIpcClient(socketPath));
    const pending = Effect.runPromise(Effect.result(client.handshake()));
    await peer.waitForRequests(1);
    peer.respond(0, { apiVersion: 'v1' });
    const pendingResult = await pending;
    expect(pendingResult._tag).toBe('Success');
    await Effect.runPromise(client.close());
    await peer.close();
  });

  it('settles pending requests on clean peer close', async () => {
    const socketPath = `/tmp/canopy-ipc-${process.pid}-${Math.random().toString(36).slice(2, 7)}.sock`;
    const peer = await createRawPeer(socketPath);
    const client = await Effect.runPromise(makeIpcClient(socketPath));
    const first = Effect.runPromise(Effect.result(client.getNode('first')));
    const second = Effect.runPromise(Effect.result(client.getNode('second')));
    await peer.waitForRequests(2);
    peer.closeClient();
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result._tag)).toEqual(['Failure', 'Failure']);
    expect(results.map((result) => (result._tag === 'Failure' ? result.failure : null))).toEqual([
      {
        _tag: 'IpcClientError',
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: 'Socket closed by peer',
      },
      {
        _tag: 'IpcClientError',
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: 'Socket closed by peer',
      },
    ]);
    await peer.waitForClosedConnections(1);
    await peer.close();
  });

  it('settles pending requests when the real client socket emits an error', async () => {
    const socketPath = `/tmp/canopy-ipc-${process.pid}-${Math.random().toString(36).slice(2, 7)}.sock`;
    const peer = await createRawPeer(socketPath);
    const capturedSocket = { current: undefined as net.Socket | undefined };
    const realConnect = net.connect;
    const connectSpy = spyOn(net, 'connect').mockImplementation(((
      ...arguments_: Parameters<typeof net.connect>
    ) => {
      const socket = realConnect(...arguments_);
      capturedSocket.current = socket;
      return socket;
    }) as typeof net.connect);
    const client = await Effect.runPromise(makeIpcClient(socketPath)).finally(() => {
      connectSpy.mockRestore();
    });
    const clientSocket = capturedSocket.current;
    if (!clientSocket) throw new Error('Expected the client socket to be captured');
    const first = Effect.runPromise(Effect.result(client.getNode('first')));
    const second = Effect.runPromise(Effect.result(client.getNode('second')));
    await peer.waitForRequests(2);
    const listenerCounts = ['connect', 'data', 'error', 'close', 'end'].map((event) =>
      clientSocket.listenerCount(event),
    );
    clientSocket.emit('error', new Error('test socket failure'));
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result._tag)).toEqual(['Failure', 'Failure']);
    expect(results.map((result) => (result._tag === 'Failure' ? result.failure : null))).toEqual([
      {
        _tag: 'IpcClientError',
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: 'Socket error: test socket failure',
      },
      {
        _tag: 'IpcClientError',
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: 'Socket error: test socket failure',
      },
    ]);
    expect(
      ['connect', 'data', 'error', 'close', 'end'].map((event) =>
        clientSocket.listenerCount(event),
      ),
    ).toEqual(listenerCounts.map((count) => count - 1));
    await peer.waitForClosedConnections(1);

    const unrelatedClient = await Effect.runPromise(makeIpcClient(socketPath));
    const unrelatedRequest = Effect.runPromise(Effect.result(unrelatedClient.handshake()));
    await peer.waitForRequests(3);
    peer.respond(2, { apiVersion: 'v1' });
    const unrelatedResult = await unrelatedRequest;
    expect(unrelatedResult._tag).toBe('Success');
    await Effect.runPromise(unrelatedClient.close());
    await peer.close();
  });

  it('settles pending requests on explicit close', async () => {
    const socketPath = `/tmp/canopy-ipc-${process.pid}-${Math.random().toString(36).slice(2, 7)}.sock`;
    const peer = await createRawPeer(socketPath);
    const client = await Effect.runPromise(makeIpcClient(socketPath));
    const events = { current: [] as unknown[] };
    const { promise: eventDelivered, resolve: onEventDelivered } = Promise.withResolvers<unknown>();
    const subscribed = Effect.runPromise(
      client.subscribe({}, (event) => {
        events.current = [...events.current, event];
        onEventDelivered(undefined);
      }),
    );
    await peer.waitForRequests(1);
    peer.respond(0, { subscriptionId: 'sub-close' });
    await subscribed;
    peer.notify(0, 'sub-close', { sequence: 1 });
    await eventDelivered;
    expect(events.current).toEqual([{ sequence: 1 }]);
    const first = Effect.runPromise(Effect.result(client.getNode('first')));
    const second = Effect.runPromise(Effect.result(client.getNode('second')));
    await peer.waitForRequests(3);
    await Effect.runPromise(client.close());
    const results = await Promise.all([first, second]);
    expect(results.map((result) => result._tag)).toEqual(['Failure', 'Failure']);
    expect(results.map((result) => (result._tag === 'Failure' ? result.failure : null))).toEqual([
      {
        _tag: 'IpcClientError',
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: 'Socket closed by client',
      },
      {
        _tag: 'IpcClientError',
        code: JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
        message: 'Socket closed by client',
      },
    ]);
    await peer.waitForClosedConnections(1);
    peer.notify(0, 'sub-close', { sequence: 2 });
    expect(events.current).toEqual([{ sequence: 1 }]);

    const unrelatedClient = await Effect.runPromise(makeIpcClient(socketPath));
    const unrelatedRequest = Effect.runPromise(Effect.result(unrelatedClient.handshake()));
    await peer.waitForRequests(4);
    peer.respond(3, { apiVersion: 'v1' });
    const unrelatedResult = await unrelatedRequest;
    expect(unrelatedResult._tag).toBe('Success');
    expect(events.current).toEqual([{ sequence: 1 }]);
    await Effect.runPromise(unrelatedClient.close());
    await peer.waitForClosedConnections(2);
    await peer.close();
  });
});
