import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IpcServer } from '@canopy/api-adapter';
import { createIpcServer } from '@canopy/api-adapter';
import { asDeviceId, asGraphId, asNodeId, asTypeId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Effect } from 'effect';
import type { IpcClient } from '../src/ipc/ipc-client';
import { makeIpcClient } from '../src/ipc/ipc-client';

const getSocketPath = (): string =>
  path.join(process.cwd(), 'tmp', `test-cli-client-${Math.random().toString(36).slice(2, 9)}.sock`);

describe('IpcClient integration with IpcServer', () => {
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
});
