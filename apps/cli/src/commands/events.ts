import { Command, Options } from '@effect/cli';
import type { Option } from 'effect';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '../ipc/ipc-client';
import { jsonOption, socketPathOption } from '../options';

const graphIdOption = Options.optional(Options.text('graph-id')).pipe(
  Options.withDescription('Filter event stream by graph ID'),
);

const fromSequenceOption = Options.optional(Options.integer('from-sequence')).pipe(
  Options.withDescription('Start streaming from sequence number'),
);

const eventsTailEffect = (
  socketPath: string,
  json: boolean,
  graphId: Option.Option<string>,
  fromSequence: Option.Option<number>,
) =>
  Effect.gen(function* () {
    const clientResult = yield* Effect.either(makeIpcClient(socketPath));
    if (clientResult._tag === 'Left') {
      const errorMessage = clientResult.left.message;
      if (json) {
        yield* Console.log(
          JSON.stringify(
            {
              error: errorMessage,
            },
            undefined,
            2,
          ),
        );
      } else {
        yield* Console.log(`Error: Socket disconnected (${socketPath} - ${errorMessage})`);
      }
      return yield* Effect.fail(new Error('Socket disconnected'));
    }

    const client = clientResult.right;

    const parameters = {
      ...(graphId._tag === 'Some' && { graphId: graphId.value }),
      ...(fromSequence._tag === 'Some' && { fromSequence: fromSequence.value }),
    };

    const subscribeResult = yield* Effect.either(
      client.subscribe(parameters, (event) => {
        // eslint-disable-next-line no-console
        if (json) {
          // eslint-disable-next-line no-console
          console.log(JSON.stringify(event));
        } else {
          // eslint-disable-next-line no-console
          console.log(`[event] ${JSON.stringify(event)}`);
        }
        return undefined;
      }),
    );

    if (subscribeResult._tag === 'Left') {
      yield* client.close();
      return yield* Effect.fail(new Error(`Failed to subscribe: ${subscribeResult.left.message}`));
    }

    yield* Effect.never;
  });

export const eventsTailCommand = Command.make(
  'tail',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    graphId: graphIdOption,
    fromSequence: fromSequenceOption,
  },
  ({ socketPath, json, graphId, fromSequence }) =>
    eventsTailEffect(socketPath, json, graphId, fromSequence),
).pipe(Command.withDescription('Tail events from the Canopy IPC daemon'));

export const eventsCommand = Command.make('events').pipe(
  Command.withDescription('Manage event streams'),
  Command.withSubcommands([eventsTailCommand]),
);
