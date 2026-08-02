import { Command, Options } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '../ipc/ipc-client';
import { jsonOption, socketPathOption } from '../options';

const parseProperties = (raw?: string): Effect.Effect<Record<string, unknown>, Error> => {
  if (!raw || raw.trim() === '') {
    return Effect.succeed({});
  }
  return Effect.try({
    try: () => {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        return Record_Type_Error;
      }
      return parsed as Record<string, unknown>;
    },
    catch: (error) => new Error(`Invalid properties JSON: ${String(error)}`),
  }).pipe(
    Effect.flatMap((value) =>
      value === Record_Type_Error
        ? Effect.fail(new Error('Invalid properties JSON: Properties must be a JSON object'))
        : Effect.succeed(value),
    ),
  );
};

const Record_Type_Error = Symbol('Record_Type_Error');

const edgeGetCommand = Command.make(
  'get',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.text('id').pipe(Options.withDescription('Edge ID to fetch')),
  },
  ({ socketPath, json, id }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const edge = yield* client.getEdge(id);
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(edge, undefined, 2));
      } else {
        yield* Console.log(
          `Edge [${edge.id}] (type: ${edge.type}, from: ${edge.source}, to: ${edge.target})`,
        );
        if (edge.properties) {
          yield* Console.log(`Properties: ${JSON.stringify(edge.properties, undefined, 2)}`);
        }
      }
    }),
).pipe(Command.withDescription('Get edge by ID'));

const edgeListCommand = Command.make(
  'list',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    type: Options.optional(Options.text('type')).pipe(
      Options.withDescription('Filter edges by type'),
    ),
    source: Options.optional(Options.text('source')).pipe(
      Options.withDescription('Filter edges by source node ID'),
    ),
    target: Options.optional(Options.text('target')).pipe(
      Options.withDescription('Filter edges by target node ID'),
    ),
    limit: Options.optional(Options.integer('limit')).pipe(
      Options.withDescription('Max number of edges to return'),
    ),
  },
  ({ socketPath, json, type, source, target, limit }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const edges = yield* client.getEdges({
        ...(type._tag === 'Some' && { type: type.value }),
        ...(source._tag === 'Some' && { source: source.value }),
        ...(target._tag === 'Some' && { target: target.value }),
        ...(limit._tag === 'Some' && { limit: limit.value }),
      });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(edges, undefined, 2));
      } else {
        yield* Console.log(`Found ${edges.length} edge(s):`);
        yield* Effect.forEach(
          edges,
          (edge) =>
            Console.log(`  - [${edge.id}] type=${edge.type} (${edge.source} -> ${edge.target})`),
          { discard: true },
        );
      }
    }),
).pipe(Command.withDescription('List graph edges'));

const edgeCreateCommand = Command.make(
  'create',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.optional(Options.text('id')).pipe(
      Options.withDescription('Optional explicit edge ID'),
    ),
    type: Options.text('type').pipe(Options.withDescription('Edge type identifier')),
    source: Options.text('source').pipe(Options.withDescription('Source node ID')),
    target: Options.text('target').pipe(Options.withDescription('Target node ID')),
    properties: Options.optional(Options.text('properties')).pipe(
      Options.withDescription('Edge properties formatted as JSON string'),
    ),
  },
  ({ socketPath, json, id, type, source, target, properties }) =>
    Effect.gen(function* () {
      const rawProperties = properties._tag === 'Some' ? properties.value : undefined;
      const parsedProperties = yield* parseProperties(rawProperties);

      const client = yield* makeIpcClient(socketPath);
      const createdEdge = yield* client.createEdge({
        ...(id._tag === 'Some' && { id: id.value }),
        type,
        source,
        target,
        properties: parsedProperties,
      });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(createdEdge, undefined, 2));
      } else {
        yield* Console.log(
          `Successfully created edge [${createdEdge.id}] (type: ${createdEdge.type}, ${createdEdge.source} -> ${createdEdge.target})`,
        );
      }
    }),
).pipe(Command.withDescription('Create a new edge between nodes'));

const edgeDeleteCommand = Command.make(
  'delete',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.text('id').pipe(Options.withDescription('Edge ID to delete')),
  },
  ({ socketPath, json, id }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const result = yield* client.deleteEdge({ id });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(result, undefined, 2));
      } else {
        yield* Console.log(`Successfully deleted edge [${result.id}]`);
      }
    }),
).pipe(Command.withDescription('Delete edge by ID'));

export const edgeCommand = Command.make('edge').pipe(
  Command.withSubcommands([edgeGetCommand, edgeListCommand, edgeCreateCommand, edgeDeleteCommand]),
  Command.withDescription('Edge graph operations (get, list, create, delete)'),
);
