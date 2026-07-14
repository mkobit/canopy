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
  fn: (acc: R, item: T) => Result<R, Error>,
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
  const res = fn(initial, head);
  if (!res.ok) {
    return res;
  }
  return reduceResult(tail, fn, res.value);
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
        (cg, def) =>
          cg.nodes.has(def.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(def.id, SYSTEM_IDS.NAMESPACE, def.name, def.description, {
                  kind: text(def.kind),
                }),
                NAMESPACE_MIGRATION_ID,
              ),
        g,
      ),
    (g) =>
      reduceResult(
        coreNodeTypes,
        (cg, def) =>
          cg.nodes.has(def.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(def.id, SYSTEM_IDS.NODE_TYPE, def.name, def.description, {
                  namespace: text('namespace' in def ? def.namespace : 'system'),
                  properties: text(JSON.stringify(def.properties)),
                }),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        coreEdgeTypes,
        (cg, def) => {
          if (cg.nodes.has(def.id)) {
            return ok(cg);
          }
          const props = 'properties' in def ? def.properties : undefined;
          const extraProps: Record<string, PropertyValue> = props
            ? {
                namespace: text('system'),
                properties: text(JSON.stringify(props)),
              }
            : {
                namespace: text('system'),
              };
          return addNodeGraph(
            cg,
            createBootstrapNode(
              def.id,
              SYSTEM_IDS.EDGE_TYPE,
              def.name,
              def.description,
              extraProps,
            ),
          );
        },
        g,
      ),
    (g) =>
      reduceResult(
        systemQueries,
        (cg, def) =>
          cg.nodes.has(def.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(
                  def.id,
                  SYSTEM_IDS.QUERY_DEFINITION,
                  def.name,
                  def.description,
                  { definition: text(JSON.stringify(def.definition)) },
                ),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        systemViews,
        (cg, def) => {
          if (!cg.nodes.has(def.id)) {
            const extraProps = {
              layout: text(def.layout),
              queryRef: reference(def.queryRef),
              ...('groupBy' in def && { groupBy: text(def.groupBy) }),
            };
            return addNodeGraph(
              cg,
              createBootstrapNode(
                def.id,
                SYSTEM_IDS.VIEW_DEFINITION,
                def.name,
                def.description,
                extraProps,
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
        (cg, def) =>
          cg.nodes.has(def.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(def.id, SYSTEM_IDS.SETTINGS_SCHEMA, def.key, def.description, {
                  key: text(def.key),
                  valueKind: text(def.valueKind),
                  defaultValue: text(def.defaultValue),
                  description: text(def.description),
                  scopes: text(def.scopes),
                  namespace: text(def.namespace),
                }),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        systemRenderers,
        (cg, def) =>
          cg.nodes.has(def.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(def.id, SYSTEM_IDS.RENDERER, def.name, def.description, {
                  rendererKind: text(def.rendererKind),
                  entryPoint: text(def.entryPoint),
                  permissions: def.permissions,
                  namespace: text(def.namespace),
                }),
              ),
        g,
      ),
    (g) =>
      reduceResult(
        defaultViews,
        (cg, def) =>
          cg.nodes.has(def.id)
            ? ok(cg)
            : addNodeGraph(
                cg,
                createBootstrapNode(def.id, SYSTEM_IDS.VIEW_DEFINITION, def.name, def.description, {
                  layout: text(def.layout),
                  namespace: text(def.namespace),
                }),
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
        (cg, edgeDef) =>
          cg.edges.has(asEdgeId(edgeDef.id))
            ? ok(cg)
            : addEdgeGraph(cg, edgeDef.id, edgeDef.type, edgeDef.source, edgeDef.target),
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
        (cg, edgeDef) =>
          cg.edges.has(asEdgeId(edgeDef.id))
            ? ok(cg)
            : addEdgeGraph(cg, edgeDef.id, edgeDef.type, edgeDef.source, edgeDef.target),
        g,
      );
    },
  ];

  return reduceResult(allSteps, (g, step) => step(g), graph);
}
