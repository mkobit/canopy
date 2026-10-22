import { Command } from 'effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '@canopy/api-adapter';
import { jsonOption, socketPathOption } from '../options';

export const statusEffect = (socketPath: string, json: boolean) =>
  Effect.gen(function* () {
    const clientResult = yield* Effect.result(makeIpcClient(socketPath));
    if (clientResult._tag === 'Failure') {
      const errorMessage = clientResult.failure.message;
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

    const client = clientResult.success;
    const result = yield* Effect.result(client.handshake());
    yield* client.close();

    if (result._tag === 'Failure') {
      const errorMessage = result.failure.message;
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

    const { apiVersion, serverVersion, capabilities } = result.success;
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
