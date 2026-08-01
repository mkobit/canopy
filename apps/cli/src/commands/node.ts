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

const nodeGetCommand = Command.make(
  'get',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.text('id').pipe(Options.withDescription('Node ID to fetch')),
  },
  ({ socketPath, json, id }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const node = yield* client.getNode(id);
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(node, undefined, 2));
      } else {
        yield* Console.log(`Node [${node.id}] (type: ${node.type})`);
        yield* Console.log(`Properties: ${JSON.stringify(node.properties, undefined, 2)}`);
      }
    }),
).pipe(Command.withDescription('Get node by ID'));

const nodeListCommand = Command.make(
  'list',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    type: Options.optional(Options.text('type')).pipe(
      Options.withDescription('Filter nodes by type'),
    ),
    limit: Options.optional(Options.integer('limit')).pipe(
      Options.withDescription('Max number of nodes to return'),
    ),
  },
  ({ socketPath, json, type, limit }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const nodes = yield* client.getNodes({
        ...(type._tag === 'Some' && { type: type.value }),
        ...(limit._tag === 'Some' && { limit: limit.value }),
      });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(nodes, undefined, 2));
      } else {
        yield* Console.log(`Found ${nodes.length} node(s):`);
        yield* Effect.forEach(nodes, (node) => Console.log(`  - [${node.id}] type=${node.type}`), {
          discard: true,
        });
      }
    }),
).pipe(Command.withDescription('List graph nodes'));

const nodeCreateCommand = Command.make(
  'create',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.optional(Options.text('id')).pipe(
      Options.withDescription('Optional explicit node ID'),
    ),
    type: Options.text('type').pipe(Options.withDescription('Node type identifier')),
    properties: Options.optional(Options.text('properties')).pipe(
      Options.withDescription('Node properties formatted as JSON string'),
    ),
  },
  ({ socketPath, json, id, type, properties }) =>
    Effect.gen(function* () {
      const rawProperties = properties._tag === 'Some' ? properties.value : undefined;
      const parsedProperties = yield* parseProperties(rawProperties);

      const client = yield* makeIpcClient(socketPath);
      const createdNode = yield* client.createNode({
        ...(id._tag === 'Some' && { id: id.value }),
        type,
        properties: parsedProperties,
      });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(createdNode, undefined, 2));
      } else {
        yield* Console.log(
          `Successfully created node [${createdNode.id}] (type: ${createdNode.type})`,
        );
      }
    }),
).pipe(Command.withDescription('Create a new node'));

const nodeUpdateCommand = Command.make(
  'update',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.text('id').pipe(Options.withDescription('Target node ID')),
    properties: Options.text('properties').pipe(
      Options.withDescription('Updated properties formatted as JSON string'),
    ),
  },
  ({ socketPath, json, id, properties }) =>
    Effect.gen(function* () {
      const parsedProperties = yield* parseProperties(properties);

      const client = yield* makeIpcClient(socketPath);
      const updatedNode = yield* client.updateNodeProperties({
        id,
        properties: parsedProperties,
      });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(updatedNode, undefined, 2));
      } else {
        yield* Console.log(`Successfully updated properties for node [${updatedNode.id}]`);
      }
    }),
).pipe(Command.withDescription('Update properties for an existing node'));

const nodeDeleteCommand = Command.make(
  'delete',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.text('id').pipe(Options.withDescription('Node ID to delete')),
  },
  ({ socketPath, json, id }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const result = yield* client.deleteNode({ id });
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(result, undefined, 2));
      } else {
        yield* Console.log(`Successfully deleted node [${result.id}]`);
      }
    }),
).pipe(Command.withDescription('Delete node by ID'));

export const nodeCommand = Command.make('node').pipe(
  Command.withSubcommands([
    nodeGetCommand,
    nodeListCommand,
    nodeCreateCommand,
    nodeUpdateCommand,
    nodeDeleteCommand,
  ]),
  Command.withDescription('Node graph operations (get, list, create, update, delete)'),
);
