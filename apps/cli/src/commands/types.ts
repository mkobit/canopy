import { Command, Options } from '@effect/cli';
import { Console, Effect } from 'effect';
import { makeIpcClient } from '@canopy/api-adapter';
import { jsonOption, socketPathOption } from '../options';

const NODE_TYPE_ID = 'node:type:node-type';
const EDGE_TYPE_ID = 'node:type:edge-type';

const typesListCommand = Command.make(
  'list',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    kind: Options.optional(Options.choice('kind', ['node', 'edge', 'all'])).pipe(
      Options.withDescription('Filter type definitions by kind (node, edge, all)'),
    ),
  },
  ({ socketPath, json, kind }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const selectedKind = kind._tag === 'Some' ? kind.value : 'all';

      const nodes =
        selectedKind === 'node'
          ? yield* client.getNodes({ type: NODE_TYPE_ID })
          : selectedKind === 'edge'
            ? yield* client.getNodes({ type: EDGE_TYPE_ID })
            : yield* client.getNodes();

      const typeNodes =
        selectedKind === 'all'
          ? nodes.filter((n) => n.type === NODE_TYPE_ID || n.type === EDGE_TYPE_ID)
          : nodes;

      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(typeNodes, undefined, 2));
      } else {
        yield* Console.log(`Found ${typeNodes.length} type definition(s):`);
        yield* Effect.forEach(
          typeNodes,
          (node) =>
            Console.log(`  - [${node.id}] (kind: ${node.type === EDGE_TYPE_ID ? 'edge' : 'node'})`),
          { discard: true },
        );
      }
    }),
).pipe(Command.withDescription('List schema type definitions'));

const typesGetCommand = Command.make(
  'get',
  {
    socketPath: socketPathOption,
    json: jsonOption,
    id: Options.text('id').pipe(Options.withDescription('Type definition node ID to fetch')),
  },
  ({ socketPath, json, id }) =>
    Effect.gen(function* () {
      const client = yield* makeIpcClient(socketPath);
      const node = yield* client.getNode(id);
      yield* client.close();

      if (json) {
        yield* Console.log(JSON.stringify(node, undefined, 2));
      } else {
        yield* Console.log(`Type Definition [${node.id}] (type: ${node.type})`);
        yield* Console.log(`Properties: ${JSON.stringify(node.properties, undefined, 2)}`);
      }
    }),
).pipe(Command.withDescription('Get schema type definition by ID'));

export const typesCommand = Command.make('types').pipe(
  Command.withSubcommands([typesListCommand, typesGetCommand]),
  Command.withDescription('Schema and type definition operations (list, get)'),
);
