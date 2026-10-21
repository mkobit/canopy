import { Command, Flag } from 'effect/cli';
import type { Option } from 'effect';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '@canopy/api-adapter';
import { jsonOption, socketPathOption } from '../options';

const graphIdOption = Flag.optional(Flag.String('graph-id')).pipe(
  Flag.withDescription('Filter event stream by graph ID'),
);

const fromSequenceOption = Flag.optional(Flag.Int('from-sequence')).pipe(
  Flag.withDescription('Start streaming from sequence number'),
);

const eventsTailEffect = (
  socketPath: string,
  json: boolean,
  graphId: Readonly<Option.Option<string>>,
  fromSequence: Readonly<Option.Option<number>>,
) =>
  Effect.gen(function* () {
    const clientResult = yield* Effect.result(makeIpcClient(socketPath));
    if (clientResult._tag === 'Failure') {
      const errorMessage = clientResult.failure.message;
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

    const client = clientResult.success;

    const parameters = {
      ...(graphId._tag === 'Some' && { graphId: graphId.value }),
      ...(fromSequence._tag === 'Some' && { fromSequence: fromSequence.value }),
    };

    const subscribeResult = yield* Effect.result(
      client.subscribe(parameters, (event) => {
        if (json) {
          Effect.runSync(Console.log(JSON.stringify(event)));
        } else {
          Effect.runSync(Console.log(`[event] ${JSON.stringify(event)}`));
        }
        return undefined;
      }),
    );

    if (subscribeResult._tag === 'Failure') {
      yield* client.close();
      return yield* Effect.fail(
        new Error(`Failed to subscribe: ${subscribeResult.failure.message}`),
      );
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
