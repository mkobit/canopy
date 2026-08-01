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
  path.join(
    process.cwd(),
    'tmp',
    `test-types-query-${Math.random().toString(36).slice(2, 9)}.sock`,
  );

const runCli = (arguments_: readonly string[]) =>
  Effect.runPromise(
    Command.run(rootCommand, { name: 'Canopy CLI', version: '0.1.0' })([
      'node',
      'canopy',
      ...arguments_,
    ]).pipe(Effect.provide(NodeContext.layer)),
  );

describe('Canopy CLI types and query commands', () => {
  let server: IpcServer | undefined;
  let socketPath: string;

  beforeEach(async () => {
    socketPath = getSocketPath();
    const eventLogStore = createInMemoryEventStore();
    const graphId = asGraphId('graph_types_query_test');
    const deviceId = asDeviceId('dev_types_query_test');
    const session = createGraphSession(eventLogStore, graphId, deviceId);
    const context = { graph: session.graph(), session, eventLogStore };

    server = createIpcServer({ socketPath, context });
    const listenResponse = await server.listen();
    expect(listenResponse.ok).toBe(true);
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

  it('runs types list subcommand with --json and --kind options', async () => {
    await runCli(['types', 'list', '--socket-path', socketPath, '--json']);
    await runCli(['types', 'list', '--socket-path', socketPath, '--kind', 'node', '--json']);
    await runCli(['types', 'list', '--socket-path', socketPath, '--kind', 'edge', '--json']);
    await runCli(['types', 'list', '--socket-path', socketPath, '--kind', 'all']);
  });

  it('runs types get subcommand', async () => {
    // Create a type node definition first to get
    await runCli([
      'node',
      'create',
      '--socket-path',
      socketPath,
      '--id',
      'node:type:test-type',
      '--type',
      'node:type:node-type',
      '--properties',
      '{"name":"TestType","namespace":"user"}',
      '--json',
    ]);

    await runCli([
      'types',
      'get',
      '--socket-path',
      socketPath,
      '--id',
      'node:type:test-type',
      '--json',
    ]);
    await runCli(['types', 'get', '--socket-path', socketPath, '--id', 'node:type:test-type']);
  });

  it('runs query execute subcommand with --json and --query options', async () => {
    await runCli(['query', 'execute', '--socket-path', socketPath, '--json']);
    await runCli(['query', 'execute', '--socket-path', socketPath, '--query', 'nodes()', '--json']);
    await runCli(['query', 'execute', '--socket-path', socketPath, '--steps', '[]']);
  });
});
