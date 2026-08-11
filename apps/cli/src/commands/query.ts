import { Command, Options } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '@canopy/api-adapter';
import { jsonOption, socketPathOption } from '../options';

const parseSteps = (raw?: string): Effect.Effect<readonly unknown[] | undefined, Error> => {
  if (!raw || raw.trim() === '') {
    return Effect.succeed(undefined);
  }
  return Effect.try({
    try: () => {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return Array_Type_Error;
      }
      return parsed as readonly unknown[];
    },
    catch: (error) => new Error(`Invalid steps JSON: ${String(error)}`),
  }).pipe(
    Effect.flatMap((value) =>
      value === Array_Type_Error
        ? Effect.fail(new Error('Invalid steps JSON: Steps must be a JSON array'))
        : Effect.succeed(value),
    ),
  );
};

const Array_Type_Error = Symbol('Array_Type_Error');

const queryExecuteCommand = Command.make(
  'execute',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    query: Options.optional(Options.text('query')).pipe(
      Options.withDescription('Graph query string or DSL expression'),
    ),
    steps: Options.optional(Options.text('steps')).pipe(
      Options.withDescription('Query steps formatted as JSON string'),
    ),
  },
  ({ socketPath, json, query, steps }) =>
    Effect.gen(function* () {
      const rawSteps = steps._tag === 'Some' ? steps.value : undefined;
      const parsedSteps = yield* parseSteps(rawSteps);
      const queryString = query._tag === 'Some' ? query.value : undefined;

      const client = yield* makeIpcClient(socketPath);
      const nodes = yield* client.executeQuery({
        ...(queryString !== undefined && { query: queryString }),
        ...(parsedSteps !== undefined && { steps: parsedSteps as unknown[] }),
      });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(nodes, undefined, 2));
      } else {
        yield* Console.log(`Query returned ${nodes.length} result(s):`);
        yield* Effect.forEach(nodes, (node) => Console.log(`  - [${node.id}] type=${node.type}`), {
          discard: true,
        });
      }
    }),
).pipe(Command.withDescription('Execute graph DSL queries'));

export const queryCommand = Command.make('query').pipe(
  Command.withSubcommands([queryExecuteCommand]),
  Command.withDescription('Graph DSL query operations (execute)'),
);
