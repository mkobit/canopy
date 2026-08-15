import type { Graph } from './graph';
import type { Node } from './node';
import type { Edge } from './edge';
import type { PropertyValue } from './properties';
import type { TypeId, NodeId } from './identifiers';
import type { Result } from './result';
import { createInstant, asNodeId, asEdgeId } from './factories';
import { ok } from './result';
import { addNode, addEdge } from './ops';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system';
export { SYSTEM_DEVICE_ID } from './bootstrap-definitions';
import {
  SYSTEM_DEVICE_ID,
  createBootstrapNode,
  text,
  reference,
  nodeTypeProperties,
  edgeTypeProperties,
  namespaceProperties,
  propertyTypeProperties,
  namespaceMigrations,
  coreNodeTypes,
  coreEdgeTypes,
  systemQueries,
  systemViews,
  systemSettings,
  systemRenderers,
  systemPlugins,
  defaultViews,
  rendererProperties,
  queryDefinitionProperties,
  viewDefinitionProperties,
  templateProperties,
} from './bootstrap-definitions';

function addNodeGraph(graph: Graph, node: Node, migrationId?: string): Result<Graph, Error> {
  const result = addNode(graph, node, {
    deviceId: SYSTEM_DEVICE_ID,
    ...(migrationId !== undefined && { migrationId }),
  });
  if (result.ok) {
    return ok(result.value.graph);
  }
  return result;
}

function addEdgeGraph(
  graph: Graph,
  id: string,
  type: TypeId,
  source: NodeId,
  target: NodeId,
): Result<Graph, Error> {
  const edge: Edge = {
    id: asEdgeId(id),
    type,
    source,
    target,
    properties: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };
  const result = addEdge(graph, edge, {
    deviceId: SYSTEM_DEVICE_ID,
  });
  if (result.ok) {
    return ok(result.value.graph);
  }
  return result;
}

// Helper to reduce results safely using recursion to avoid loops
function reduceResult<T, R>(
  items: readonly T[],
  function_: (accumulator: R, item: T) => Result<R, Error>,
  initial: R,
): Result<R, Error> {
  if (items.length === 0) {
    return ok(initial);
  }
  const head = items[0];
  if (head === undefined) {
    // This should theoretically not happen due to length check, but safe for noUncheckedIndexedAccess
    return ok(initial);
  }
  const tail = items.slice(1);
  const result = function_(initial, head);
  if (!result.ok) {
    return result;
  }
  return reduceResult(tail, function_, result.value);
}

/**
 * Bootstraps a graph with system nodes.
 * This is idempotent - it only adds nodes if they are missing.
 */
// eslint-disable-next-line max-lines-per-function
export function bootstrap(graph: Graph): Result<Graph, Error> {
  const steps: readonly ((g: Graph) => Result<Graph, Error>)[] = [
    // 1. Ensure NodeType definition exists
    (g) =>
      g.nodes.has(SYSTEM_IDS.NODE_TYPE_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.NODE_TYPE_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Node Type',
              'Defines a type of node in the graph.',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(nodeTypeProperties)),
              },
            ),
          ),

    (g) =>
      g.nodes.has(SYSTEM_IDS.RENDERER_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.RENDERER_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Renderer',
              'Defines how to render nodes of a type',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(rendererProperties)),
              },
            ),
          ),

    // 2. Ensure EdgeType definition exists
    (g) =>
      g.nodes.has(SYSTEM_IDS.EDGE_TYPE_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.EDGE_TYPE_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Edge Type',
              'Defines a type of edge in the graph.',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(edgeTypeProperties)),
              },
            ),
          ),

    // Ensure Namespace metatype definition exists
    (g) =>
      g.nodes.has(SYSTEM_IDS.NAMESPACE_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.NAMESPACE_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Namespace',
              "Defines a logical partition within the graph's identity space.",
              {
                namespace: text('system'),
                properties: text(JSON.stringify(namespaceProperties)),
              },
            ),
          ),

    // Ensure PropertyType metatype definition exists
    (g) =>
      g.nodes.has(SYSTEM_IDS.PROPERTY_TYPE_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.PROPERTY_TYPE_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Property Type',
              'Defines a reusable property shape that a NodeType or EdgeType can reference.',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(propertyTypeProperties)),
              },
            ),
          ),

    (g) =>
      g.nodes.has(SYSTEM_IDS.QUERY_DEFINITION_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.QUERY_DEFINITION_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Query Definition',
              'Defines a stored query in the graph.',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(queryDefinitionProperties)),
              },
            ),
          ),

    (g) =>
      g.nodes.has(SYSTEM_IDS.VIEW_DEFINITION_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.VIEW_DEFINITION_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'View Definition',
              'Defines a view of data in the graph.',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(viewDefinitionProperties)),
              },
            ),
          ),

    (g) =>
      g.nodes.has(SYSTEM_IDS.TEMPLATE_DEF)
        ? ok(g)
        : addNodeGraph(
            g,
            createBootstrapNode(
              SYSTEM_IDS.TEMPLATE_DEF,
              SYSTEM_IDS.NODE_TYPE,
              'Template',
              'Defines a UI template.',
              {
                namespace: text('system'),
                properties: text(JSON.stringify(templateProperties)),
              },
            ),
          ),
  ];

  const NAMESPACE_MIGRATION_ID = 'migrate-hardcoded-namespaces-to-nodes';

  // Chain everything
  const allSteps: readonly ((g: Graph) => Result<Graph, Error>)[] = [
    ...steps,
    (g) =>
      reduceResult(
        namespaceMigrations,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.NAMESPACE,
                  definition.name,
                  definition.description,
                  {
                    kind: text(definition.kind),
                  },
                ),
                NAMESPACE_MIGRATION_ID,
              ),
        g,
      ),
    (g) =>
      reduceResult(
        coreNodeTypes,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.NODE_TYPE,
                  definition.name,
                  definition.description,
                  {
                    namespace: text('namespace' in definition ? definition.namespace : 'system'),
                    properties: text(JSON.stringify(definition.properties)),
                  },
                ),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        coreEdgeTypes,
        (cg, definition) => {
          if (cg.nodes.has(definition.id)) {
            return ok(cg);
          }
          const properties = 'properties' in definition ? definition.properties : undefined;
          const extraProperties: Readonly<Record<string, PropertyValue>> = properties
            ? {
                namespace: text('system'),
                properties: text(JSON.stringify(properties)),
              }
            : {
                namespace: text('system'),
              };
          return addNodeGraph(
            cg,
            createBootstrapNode(
              definition.id,
              SYSTEM_IDS.EDGE_TYPE,
              definition.name,
              definition.description,
              extraProperties,
            ),
          );
        },
        g,
      ),
    (g) =>
      reduceResult(
        systemQueries,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.QUERY_DEFINITION,
                  definition.name,
                  definition.description,
                  { definition: text(JSON.stringify(definition.definition)) },
                ),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        systemViews,
        (cg, definition) => {
          if (!cg.nodes.has(definition.id)) {
            const extraProperties = {
              layout: text(definition.layout),
              queryRef: reference(definition.queryRef),
              ...('groupBy' in definition && { groupBy: text(definition.groupBy) }),
            };
            return addNodeGraph(
              cg,
              createBootstrapNode(
                definition.id,
                SYSTEM_IDS.VIEW_DEFINITION,
                definition.name,
                definition.description,
                extraProperties,
              ),
            );
          }
          return ok(cg);
        },
        g,
      ),
    (g) =>
      reduceResult(
        systemSettings,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.SETTINGS_SCHEMA,
                  definition.key,
                  definition.description,
                  {
                    key: text(definition.key),
                    valueKind: text(definition.valueKind),
                    defaultValue: text(definition.defaultValue),
                    description: text(definition.description),
                    scopes: text(definition.scopes),
                    namespace: text(definition.namespace),
                  },
                ),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        systemRenderers,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.RENDERER,
                  definition.name,
                  definition.description,
                  {
                    rendererKind: text(definition.rendererKind),
                    entryPoint: text(definition.entryPoint),
                    permissions: definition.permissions,
                    namespace: text(definition.namespace),
                  },
                ),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        systemPlugins,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.TYPE_PLUGIN,
                  'Canopy Markdown Renderer',
                  'First-party Tier-1 Markdown content renderer',
                  {
                    wasm_binary: text(definition.wasmBinary),
                    manifest: text(definition.manifest),
                    version: text(definition.version),
                  },
                ),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        defaultViews,
        (cg, definition) =>
          cg.nodes.has(definition.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  definition.id,
                  SYSTEM_IDS.VIEW_DEFINITION,
                  definition.name,
                  definition.description,
                  {
                    layout: text(definition.layout),
                    namespace: text(definition.namespace),
                  },
                ),
              ),
        g,
      ),
    (g) => {
      const usesEdges = [
        {
          id: 'system:edge:uses-renderer:text-block',
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: asNodeId('system:view:text-block'),
          target: asNodeId('system:renderer:text'),
        },
        {
          id: 'system:edge:uses-renderer:code-block',
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: asNodeId('system:view:code-block'),
          target: asNodeId('system:renderer:code'),
        },
        {
          id: 'system:edge:uses-renderer:markdown',
          type: SYSTEM_EDGE_TYPES.USES_RENDERER,
          source: asNodeId('system:view:markdown'),
          target: asNodeId('system:renderer:markdown'),
        },
      ];

      return reduceResult(
        usesEdges,
        (cg, edgeDefinition) =>
          cg.edges.has(asEdgeId(edgeDefinition.id))
            ? ok(cg)
            : addEdgeGraph(
                cg,
                edgeDefinition.id,
                edgeDefinition.type,
                edgeDefinition.source,
                edgeDefinition.target,
              ),
        g,
      );
    },
    (g) => {
      const defaultViewEdges = [
        {
          id: 'system:edge:default-view:text-block',
          type: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
          source: SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK,
          target: asNodeId('system:view:text-block'),
        },
        {
          id: 'system:edge:default-view:code-block',
          type: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
          source: SYSTEM_IDS.NODE_TYPE_CODE_BLOCK,
          target: asNodeId('system:view:code-block'),
        },
        {
          id: 'system:edge:default-view:markdown',
          type: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
          source: SYSTEM_IDS.NODE_TYPE_MARKDOWN,
          target: asNodeId('system:view:markdown'),
        },
      ];

      return reduceResult(
        defaultViewEdges,
        (cg, edgeDefinition) =>
          cg.edges.has(asEdgeId(edgeDefinition.id))
            ? ok(cg)
            : addEdgeGraph(
                cg,
                edgeDefinition.id,
                edgeDefinition.type,
                edgeDefinition.source,
                edgeDefinition.target,
              ),
        g,
      );
    },
  ];

  return reduceResult(allSteps, (g, step) => step(g), graph);
}
