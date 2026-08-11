import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IpcServer } from '@canopy/api-adapter';
import { createApiAdapterContext, createIpcServer, makeIpcClient } from '@canopy/api-adapter';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Effect } from 'effect';
import { CLIP_NAMESPACE, WEBCLIP_TYPE_NAME, ensureWebClipType } from '../src/ensure-webclip-type';

const getSocketPath = (): string =>
  path.join(
    process.cwd(),
    'tmp',
    `test-clip-host-ensure-type-${Math.random().toString(36).slice(2, 9)}.sock`,
  );

describe('ensureWebClipType', () => {
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

  it('7.4 authors the clip namespace and WebClip type on first run, reuses it on the second', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_ensure_type_test');
    const deviceId = asDeviceId('dev_ensure_type_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = createApiAdapterContext({ graph: session.graph(), session, eventLogStore });

    server = createIpcServer({ socketPath, context });
    const listenResponse = await server.listen();
    expect(listenResponse.ok).toBe(true);

    const program = Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);

      const first = yield* ensureWebClipType(client);
      expect(first.created).toBe(true);

      const second = yield* ensureWebClipType(client);
      expect(second.created).toBe(false);
      expect(second.typeId).toBe(first.typeId);

      const nodeTypeNodes = yield* client.getNodes({ type: 'node:type:node-type' });
      const webClipTypeNodes = nodeTypeNodes.filter(
        (node) =>
          node.properties.name === WEBCLIP_TYPE_NAME &&
          node.properties.namespace === CLIP_NAMESPACE,
      );
      expect(webClipTypeNodes.length).toBe(1);

      yield* client.close();
    });

    await Effect.runPromise(program);
  });
});
