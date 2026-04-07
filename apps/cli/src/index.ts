import { Command } from '@effect/cli';
import { NodeContext, NodeRuntime } from '@effect/platform-node';
import { Effect } from 'effect';

const rootCommand = Command.make('canopy').pipe(
  Command.withHandler(() =>
    Effect.log('Welcome to Canopy CLI! Use --help to see available commands.'),
  ),
);

const run = Command.run(rootCommand, {
  name: 'Canopy CLI',
  version: '0.0.1',
});

run(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
