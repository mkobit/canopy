import { Command, Flag } from 'effect/cli';
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Cause, Effect, Exit, Runtime } from 'effect';
import type { DaemonConfigOverrides } from './config';
import { resolveDaemonConfig } from './config';
import { startHost } from './host';
import {
  daemonCliFormatter,
  runWithDaemonCliOutput,
  withExecutableErrorReporting,
} from './cli-output';

const socketPathOption = Flag.optional(Flag.String('socket-path')).pipe(
  Flag.withDescription(
    'Path to the Unix domain socket to listen on (default: under XDG_RUNTIME_DIR)',
  ),
);

const databasePathOption = Flag.optional(Flag.String('db-path')).pipe(
  Flag.withDescription('Path to the SQLite event-log database file'),
);

const ephemeralOption = Flag.Boolean('ephemeral').pipe(
  Flag.withDefault(false),
  Flag.withDescription(
    'Use an in-memory event log instead of SQLite. For tests only -- state is not persisted.',
  ),
);

// Resolves config, then hosts the IPC server for the process lifetime as a
// scoped resource: the release effect (server.close() + event log close())
// is guaranteed to run on normal interruption (SIGINT/SIGTERM, wired below by
// NodeRuntime.runMain) because Effect.scoped always closes its scope when the
// wrapped effect finishes, including by interruption -- see apps/daemon/tests
// for a test that exercises this rather than assuming it.
const bootDaemon = (overrides: DaemonConfigOverrides) =>
  Effect.scoped(
    Effect.gen(function* () {
      const configResult = resolveDaemonConfig(overrides);
      if (!configResult.ok) {
        return yield* Effect.fail(new Error(configResult.error.message));
      }
      const config = configResult.value;

      const host = yield* Effect.acquireRelease(
        Effect.promise(() => startHost(config)).pipe(
          Effect.flatMap((result) =>
            result.ok ? Effect.succeed(result.value) : Effect.fail(new Error(result.error.message)),
          ),
        ),
        (running) => Effect.promise(() => running.close()),
      );

      yield* Effect.logInfo(`canopy-daemon listening on ${host.getSocketPath()}`);

      // Never self-daemonizes: this keeps the fiber (and process) alive in
      // the foreground for the process lifetime. Launch/supervision is out
      // of scope -- whatever starts this process owns keeping it running.
      return yield* Effect.never;
    }),
  );

// apps/daemon is the server executable itself (dockerd-style), not invoked
// with a verb a human types -- a single root command with optional flags,
// no subcommands.
export const daemonCommand = Command.make(
  'canopy-daemon',
  { socketPath: socketPathOption, databasePath: databasePathOption, ephemeral: ephemeralOption },
  ({ socketPath, databasePath, ephemeral }) =>
    bootDaemon({
      ...(socketPath._tag === 'Some' && { socketPath: socketPath.value }),
      ...(databasePath._tag === 'Some' && { databasePath: databasePath.value }),
      ephemeral,
    }),
).pipe(
  Command.withDescription(
    'Foreground host process for the Canopy IPC server. Not self-daemonizing: runs until interrupted.',
  ),
);

export const run = Command.run(daemonCommand, { version: '0.1.0', renderErrors: false });
const runWithOutput = runWithDaemonCliOutput(run, daemonCliFormatter('Canopy Daemon', '0.1.0'));

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
