import { Command, Options } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '../ipc/ipc-client';
import { jsonOption, socketPathOption } from '../options';

export const handshakeCommand = Command.make(
  'handshake',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    clientVersion: Options.text('client-version').pipe(
      Options.withDefault('0.1.0'),
      Options.withDescription('Client version string to present to server'),
    ),
  },
  ({ socketPath, json, clientVersion }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const result = yield* client.handshake(clientVersion);
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(result, undefined, 2));
      } else {
        yield* Console.log(
          `Handshake successful: API ${result.apiVersion}, Server ${result.serverVersion}`,
        );
        yield* Console.log(`Capabilities: ${result.capabilities.join(', ')}`);
      }
    }),
).pipe(Command.withDescription('Perform protocol capability handshake with Canopy IPC server'));
