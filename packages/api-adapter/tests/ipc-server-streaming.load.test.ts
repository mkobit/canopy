import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Temporal } from 'temporal-polyfill';
import { createApiAdapterContext } from '../src/api-context';
import { IPC_METHODS, createIpcServer } from '../src/ipc';
import type { IpcServer } from '../src/ipc';

const getSocketPath = (): string =>
  path.join(
    process.cwd(),
    'tmp',
    `test-ipc-load-${Temporal.Now.instant().epochMilliseconds}-${Math.random().toString(36).slice(2, 7)}.sock`,
  );

type JsonRpcLine = Readonly<{
  id?: number;
  result?: Readonly<Record<string, unknown>>;
  method?: string;
  params?: Readonly<Record<string, unknown>>;
}>;

// Minimal NDJSON line reassembly for a raw net.Socket, mirroring the framing
// both ipc-server.ts and apps/cli/src/ipc/ipc-client.ts use on the wire.
const onEachLine = (socket: net.Socket, handleLine: (line: JsonRpcLine) => void): void => {
  let buffer = '';
  socket.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        handleLine(JSON.parse(line) as JsonRpcLine);
      }
      newlineIndex = buffer.indexOf('\n');
    }
  });
};

const connect = async (socketPath: string): Promise<net.Socket> => {
  const client = net.connect(socketPath);
  await new Promise((resolve, reject) => {
    client.once('connect', resolve);
    client.once('error', reject);
  });
  return client;
};

describe('IpcServer Streaming Load Test (high concurrency)', () => {
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

  it('benchmarks 50 concurrent connections issuing 20 sequential requests each (1000 total round trips)', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_load_concurrency');
    const deviceId = asDeviceId('dev_load_concurrency');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();

    const connectionCount = 50;
    const requestsPerConnection = 20;

    const runConnection = async (): Promise<void> => {
      const client = await connect(socketPath);
      const pending = new Map<number, (line: JsonRpcLine) => void>();
      onEachLine(client, (line) => {
        if (typeof line.id === 'number') {
          pending.get(line.id)?.(line);
        }
      });

      for (let requestIndex = 0; requestIndex < requestsPerConnection; requestIndex++) {
        const response = await new Promise<JsonRpcLine>((resolve) => {
          pending.set(requestIndex, resolve);
          client.write(
            `${JSON.stringify({
              jsonrpc: '2.0',
              method: IPC_METHODS.HANDSHAKE,
              params: { clientVersion: '0.1.0' },
              id: requestIndex,
            })}\n`,
          );
        });
        expect((response.result as Readonly<{ apiVersion: string }>).apiVersion).toBe('v1');
      }

      client.destroy();
    };

    const start = performance.now();
    await Promise.all(Array.from({ length: connectionCount }, () => runConnection()));
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(10_000); // SLA target: 1000 round trips across 50 concurrent connections < 10s
  }, 20_000);

  it('benchmarks event-stream fan-out to 25 concurrent subscribers under a 50-mutation burst', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_load_fanout');
    const deviceId = asDeviceId('dev_load_fanout');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    await server.listen();

    const subscriberCount = 25;
    // Stays under the default 100-event lifetime cap in createEventStreamSubscriber
    // (event-stream-handlers.ts) -- exceeding it auto-closes the subscription with
    // an overflow_disconnect message instead of delivering further events.
    const mutationCount = 50;
    const subscribeRequestId = 1;

    type Subscriber = Readonly<{
      client: net.Socket;
      receivedEventIds: string[];
      allReceived: Promise<void>;
    }>;

    const connectSubscriber = async (): Promise<Subscriber> => {
      const client = await connect(socketPath);
      const receivedEventIds: string[] = [];
      const { promise: allReceived, resolve: resolveAllReceived } =
        Promise.withResolvers<undefined>();
      const { promise: subAck, resolve: resolveSubAck } = Promise.withResolvers<undefined>();

      onEachLine(client, (line) => {
        if (line.id === subscribeRequestId && line.result) {
          resolveSubAck(undefined);
          return;
        }
        if (line.method === IPC_METHODS.EVENT_STREAM_EVENT && line.params?.event) {
          const event = line.params.event as Readonly<{ id: string }>;
          receivedEventIds.push(event.id);
          if (receivedEventIds.length >= mutationCount) {
            resolveAllReceived(undefined);
          }
        }
      });

      client.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          method: IPC_METHODS.EVENT_STREAM_SUBSCRIBE,
          params: {},
          id: subscribeRequestId,
        })}\n`,
      );
      await subAck;

      return { client, receivedEventIds, allReceived };
    };

    const subscribers = await Promise.all(
      Array.from({ length: subscriberCount }, () => connectSubscriber()),
    );

    const writer = await connect(socketPath);
    const pendingWrites = new Map<number, () => void>();
    onEachLine(writer, (line) => {
      if (typeof line.id === 'number') {
        pendingWrites.get(line.id)?.();
      }
    });

    const start = performance.now();

    for (let index = 0; index < mutationCount; index++) {
      await new Promise<void>((resolve) => {
        pendingWrites.set(index, resolve);
        writer.write(
          `${JSON.stringify({
            jsonrpc: '2.0',
            method: IPC_METHODS.MUTATION_CREATE_NODE,
            params: {
              id: `node_fanout_${index}`,
              type: 'concept',
              properties: { index },
            },
            id: index,
          })}\n`,
        );
      });
    }

    await Promise.all(subscribers.map((subscriber) => subscriber.allReceived));
    const duration = performance.now() - start;

    for (const subscriber of subscribers) {
      expect(subscriber.receivedEventIds.length).toBe(mutationCount);
      expect(new Set(subscriber.receivedEventIds).size).toBe(mutationCount);
    }

    expect(duration).toBeLessThan(5000); // SLA target: 50-mutation burst fanned out to 25 subscribers (1250 pushes) < 5s

    writer.destroy();
    for (const subscriber of subscribers) {
      subscriber.client.destroy();
    }
  }, 20_000);
});
