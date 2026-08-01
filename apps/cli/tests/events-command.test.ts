import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import type { IpcServer } from '@canopy/api-adapter';
import { createIpcServer } from '@canopy/api-adapter';
import { asDeviceId, asGraphId, createGraphSession } from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { Command } from '@effect/cli';
import { NodeContext } from '@effect/platform-node';
import { Effect } from 'effect';
import { rootCommand } from '../src/index';

const getSocketPath = (): string =>
  path.join(process.cwd(), 'tmp', `test-events-cmd-${Math.random().toString(36).slice(2, 9)}.sock`);

const runCli = (arguments_: readonly string[]) => {
  return Effect.runPromise(
    Command.run(rootCommand, { name: 'Canopy CLI', version: '0.1.0' })([
      'node',
      'canopy',
      ...arguments_,
    ]).pipe(Effect.provide(NodeContext.layer)),
  );
};

describe('Canopy CLI events tail command', () => {
  let server: IpcServer | undefined;
  let socketPath: string;

  beforeEach(async () => {
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

  it('fails when disconnected', async () => {
    await expect(runCli(['events', 'tail', '--socket-path', socketPath])).rejects.toThrow(
      'Socket disconnected',
    );
  });

  it('subscribes successfully and waits', async () => {
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_cli_cmd_test');
    const deviceId = asDeviceId('dev_cli_cmd_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = { graph: session.graph(), session, eventLogStore };

    server = createIpcServer({ socketPath, context });
    const listenResponse = await server.listen();
    expect(listenResponse.ok).toBe(true);

    const result = await Promise.race([
      runCli(['events', 'tail', '--socket-path', socketPath])
        .then(() => 'finished')
        .catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ]);

    expect(result).toBe('timeout');
  });
});
