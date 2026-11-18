import { Command } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Effect, Exit, Runtime } from 'effect';
import { cliOutputLayer, runWithCliOutput, withExecutableErrorReporting } from './cli-output';

export const rootCommand = Command.make('canopy');

export const run = Command.run(rootCommand, {
  version: '0.1.0',
  renderErrors: false,
});

const runWithOutput = runWithCliOutput(
  run,
  cliOutputLayer(rootCommand, 'canopy', 'Canopy CLI', '0.1.0'),
  rootCommand,
);

const teardown: Runtime.Teardown = (exit, onExit) => {
  if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) {
    onExit(0);
  } else {
    Runtime.defaultTeardown(exit, onExit);
  }
  return undefined;
};

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runWithOutput.pipe(
    Effect.provide(NodeServices.layer),
    withExecutableErrorReporting,
    NodeRuntime.runMain({ teardown, disableErrorReporting: true }),
  );
}
