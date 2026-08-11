import { Command } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '@canopy/api-adapter';
import { jsonOption, socketPathOption } from '../options';

export const statusEffect = (socketPath: string, json: boolean) =>
  Effect.gen(function* () {
    const clientResult = yield* Effect.either(makeIpcClient(socketPath));
    if (clientResult._tag === 'Left') {
      const errorMessage = clientResult.left.message;
      if (json) {
        yield* Console.log(
          JSON.stringify(
            {
              connected: false,
              socketPath,
              error: errorMessage,
            },
            undefined,
            2,
          ),
        );
      } else {
        yield* Console.log('Canopy IPC Daemon Status');
        yield* Console.log(`  x Socket disconnected (${socketPath} - ${errorMessage})`);
      }
      return yield* Effect.fail(new Error('Socket disconnected'));
    }

    const client = clientResult.right;
    const result = yield* Effect.either(client.handshake());
    yield* client.close();

    if (result._tag === 'Left') {
      const errorMessage = result.left.message;
      if (json) {
        yield* Console.log(
          JSON.stringify(
            {
              connected: false,
              socketPath,
              error: errorMessage,
            },
            undefined,
            2,
          ),
        );
      } else {
        yield* Console.log('Canopy IPC Daemon Status');
        yield* Console.log(`  x Socket disconnected (${socketPath} - ${errorMessage})`);
      }
      return yield* Effect.fail(new Error('Socket disconnected'));
    }

    const { apiVersion, serverVersion, capabilities } = result.right;
    if (json) {
      yield* Console.log(
        JSON.stringify(
          {
            connected: true,
            socketPath,
            apiVersion,
            serverVersion,
            capabilities,
            activeSession: 'ready',
          },
          undefined,
          2,
        ),
      );
    } else {
      yield* Console.log('Canopy IPC Daemon Status');
      yield* Console.log(`  ✓ Socket connected (${socketPath})`);
      yield* Console.log(`  ✓ API version: ${apiVersion}`);
      yield* Console.log(`  ✓ Server version: ${serverVersion}`);
      yield* Console.log(`  ✓ Capabilities: ${capabilities.join(', ')}`);
      yield* Console.log(`  ✓ Active session: Ready`);
    }
  });

export const statusCommand = Command.make(
  'status',
  {
    socketPath: socketPathOption,
    json: jsonOption,
  },
  ({ socketPath, json }) => statusEffect(socketPath, json),
).pipe(Command.withDescription('Check the status of the Canopy IPC daemon'));

export const daemonCommand = Command.make('daemon').pipe(
  Command.withDescription('Manage the Canopy IPC daemon'),
  Command.withSubcommands([statusCommand]),
);
