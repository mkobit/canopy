import { Command } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Effect } from 'effect';
import { edgeCommand } from './commands/edge';
import { eventsCommand } from './commands/events';
import { handshakeCommand } from './commands/handshake';
import { nodeCommand } from './commands/node';
import { queryCommand } from './commands/query';
import { daemonCommand, statusCommand } from './commands/status';
import { typesCommand } from './commands/types';

export const rootCommand = Command.make('canopy').pipe(
  Command.withSubcommands([
    statusCommand,
    daemonCommand,
    nodeCommand,
    edgeCommand,
    typesCommand,
    queryCommand,
    eventsCommand,
    handshakeCommand,
  ]),
);

export const run = Command.run(rootCommand, {
  name: 'Canopy CLI',
  version: '0.1.0',
});

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  run(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
}
