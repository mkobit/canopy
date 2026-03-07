import type {
  Graph,
  Node,
  PropertyMap,
  TypeId,
  NodeId,
  PropertyValue,
  PropertyDefinition,
  Result,
} from '@canopy/types';
import { createInstant, ok, asDeviceId } from '@canopy/types';
import { addNode } from './ops';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system';

export const SYSTEM_DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');

function addNodeGraph(graph: Graph, node: Node): Result<Graph, Error> {
  const result = addNode(graph, node, { deviceId: SYSTEM_DEVICE_ID });
  if (result.ok) {
    return ok(result.value.graph);
  }
  return result;
}

// Helper to create a property map
function createProperties(props: Record<string, PropertyValue>): PropertyMap {
  return new Map(Object.entries(props));
}

// Helper to create a text value
function text(value: string): PropertyValue {
  return value;
}

// Helper to create a reference value
function reference(target: NodeId): PropertyValue {
  return target;
}

function createBootstrapNode(
  id: NodeId,
  type: TypeId,
  name: string,
  description: string,
  extraProps: Record<string, PropertyValue> = {},
): Node {
  return {
    id,
    type,
    properties: createProperties({
      name: text(name),
      description: text(description),
      ...extraProps,
    }),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: SYSTEM_DEVICE_ID,
    },
  };
}

const nodeTypeProperties: readonly PropertyDefinition[] = [
  {
    name: 'name',
    valueKind: 'text',
    required: true,
    description: 'The name of the node type.',
  },
  {
    name: 'namespace',
    valueKind: 'text',
    required: true,
    description: 'The namespace this type belongs to (system, user, imported, user-settings).',
  },
  {
    name: 'description',
    valueKind: 'text',
    required: false,
    description: 'A description of the node type.',
  },
  {
    name: 'properties',
    valueKind: 'text',
    required: false,
    description: 'JSON definition of properties for this node type.',
  },
  {
    name: 'validOutgoingEdges',
    valueKind: 'list',
    required: false,
    description: 'List of valid outgoing edge types.',
  },
  {
    name: 'validIncomingEdges',
    valueKind: 'list',
    required: false,
    description: 'List of valid incoming edge types.',
  },
];

const edgeTypeProperties: readonly PropertyDefinition[] = [
  {
    name: 'name',
    valueKind: 'text',
    required: true,
    description: 'The name of the edge type.',
  },
  {
    name: 'namespace',
    valueKind: 'text',
    required: true,
    description: 'The namespace this type belongs to (system, user, imported, user-settings).',
  },
  {
    name: 'description',
    valueKind: 'text',
    required: false,
    description: 'A description of the edge type.',
  },
  {
    name: 'sourceTypes',
    valueKind: 'list',
    required: false,
    description: 'List of valid source node types.',
  },
  {
    name: 'targetTypes',
    valueKind: 'list',
    required: false,
    description: 'List of valid target node types.',
  },
  {
    name: 'properties',
    valueKind: 'text',
    required: false,
    description: 'JSON definition of properties for this edge type.',
  },
  {
    name: 'transitive',
    valueKind: 'boolean',
    required: false,
    description: 'Whether this edge type supports transitive closure queries.',
  },
  {
    name: 'inverse',
    valueKind: 'reference',
    required: false,
    description: 'Reference to the inverse EdgeType (e.g., parent_of is inverse of child_of).',
  },
];

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
                properties: text(
                  JSON.stringify([
                    {
                      name: 'name',
                      valueKind: 'text',
                      required: true,
                      description: 'Renderer name',
                    },
                    {
                      name: 'description',
                      valueKind: 'text',
                      required: false,
                      description: 'Description',
                    },
                    {
                      name: 'rendererKind',
                      valueKind: 'text',
                      required: true,
                      description: 'system | wasm | component',
                    },
                    {
                      name: 'entryPoint',
                      valueKind: 'text',
                      required: true,
                      description: 'Implementation entry point',
                    },
                    {
                      name: 'permissions',
                      valueKind: 'list',
                      required: true,
                      description: 'List of permissions',
                    },
                    {
                      name: 'configSchema',
                      valueKind: 'text',
                      required: false,
                      description: 'Configuration schema (JSON)',
                    },
                  ] satisfies readonly PropertyDefinition[]),
                ),
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
                properties: text(
                  JSON.stringify([
                    {
                      name: 'name',
                      valueKind: 'text',
                      required: true,
                      description: 'Human-readable query name',
                    },
                    {
                      name: 'description',
                      valueKind: 'text',
                      required: false,
                      description: 'What this query finds',
                    },
                    {
                      name: 'nodeTypes',
                      valueKind: 'list',
                      required: false,
                      description: 'Which node types this query targets',
                    },
                    {
                      name: 'definition',
                      valueKind: 'text',
                      required: true,
                      description: 'The query in stored format (JSON)',
                    },
                    {
                      name: 'parameters',
                      valueKind: 'list',
                      required: false,
                      description: 'Declared parameter names this query accepts',
                    },
                  ] satisfies readonly PropertyDefinition[]),
                ),
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
                properties: text(
                  JSON.stringify([
                    {
                      name: 'name',
                      valueKind: 'text',
                      required: true,
                      description: 'Human-readable view name',
                    },
                    {
                      name: 'description',
                      valueKind: 'text',
                      required: false,
                      description: 'What this view shows',
                    },
                    {
                      name: 'queryRef',
                      valueKind: 'reference',
                      required: true,
                      description: 'Reference to a QueryDefinition node',
                    },
                    {
                      name: 'layout',
                      valueKind: 'text',
                      required: true,
                      description: 'list | table | cards | graph | document',
                    },
                    {
                      name: 'sort',
                      valueKind: 'text',
                      required: false,
                      description: 'JSON string of sort criteria',
                    },
                    {
                      name: 'groupBy',
                      valueKind: 'text',
                      required: false,
                      description: 'Property name to group results',
                    },
                    {
                      name: 'displayProperties',
                      valueKind: 'list',
                      required: false,
                      description: 'Properties to show',
                    },
                    {
                      name: 'pageSize',
                      valueKind: 'number',
                      required: false,
                      description: 'Number of items per page',
                    },
                  ] satisfies readonly PropertyDefinition[]),
                ),
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
                properties: text(
                  JSON.stringify([
                    {
                      name: 'name',
                      valueKind: 'text',
                      required: true,
                      description: 'Template name',
                    },
                    {
                      name: 'layout',
                      valueKind: 'text',
                      required: true,
                      description: 'Layout handled by this template',
                    },
                    {
                      name: 'component',
                      valueKind: 'text',
                      required: false,
                      description: 'Component name',
                    },
                  ] satisfies readonly PropertyDefinition[]),
                ),
              },
            ),
          ),
  ];

  // 4. Core Node Types (Content Blocks and Settings)
  const coreNodeTypes = [
    {
      id: SYSTEM_IDS.SETTINGS_SCHEMA_DEF,
      name: 'SettingsSchema',
      description: 'Defines an available system setting.',
      namespace: 'system',
      properties: [
        {
          name: 'key',
          valueKind: 'text',
          required: true,
          description: 'Unique identifier for the setting',
        },
        {
          name: 'valueKind',
          valueKind: 'text',
          required: true,
          description: 'Expected value type',
        },
        {
          name: 'defaultValue',
          valueKind: 'text',
          required: true,
          description: 'JSON-encoded default value',
        },
        {
          name: 'description',
          valueKind: 'text',
          required: true,
          description: 'Human-readable explanation',
        },
        {
          name: 'scopes',
          valueKind: 'list',
          required: true,
          description: 'Supported scope levels',
        },
      ],
    },
    {
      id: SYSTEM_IDS.USER_SETTING_DEF,
      name: 'UserSetting',
      description: 'A user override of a setting at a specific scope.',
      namespace: 'user-settings',
      properties: [
        {
          name: 'schemaId',
          valueKind: 'reference',
          required: true,
          description: 'NodeId of the SettingsSchema this overrides',
        },
        {
          name: 'value',
          valueKind: 'text',
          required: true,
          description: 'JSON-encoded override value',
        },
        {
          name: 'scopeType',
          valueKind: 'text',
          required: true,
          description: 'One of: node, type, namespace, global',
        },
        {
          name: 'scopeTarget',
          valueKind: 'text',
          required: false,
          description: 'NodeId, TypeId, or namespace string',
        },
      ],
    },
    {
      id: SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK,
      name: 'TextBlock',
      description: 'A block of text content.',
      properties: [
        {
          name: 'content',
          valueKind: 'list',
          required: true,
          description: 'Content segments',
        },
      ],
    },
    {
      id: SYSTEM_IDS.NODE_TYPE_CODE_BLOCK,
      name: 'CodeBlock',
      description: 'A block of code.',
      properties: [
        {
          name: 'content',
          valueKind: 'text',
          required: true,
          description: 'Code content',
        },
        {
          name: 'language',
          valueKind: 'text',
          required: false,
          description: 'Programming language',
        },
      ],
    },
    {
      id: SYSTEM_IDS.NODE_TYPE_MARKDOWN,
      name: 'MarkdownNode',
      description: 'A node containing markdown content.',
      properties: [
        {
          name: 'content',
          valueKind: 'text',
          required: true,
          description: 'Markdown content',
        },
      ],
    },
  ] as const;

  // 5. Core Edge Types
  const coreEdgeTypes = [
    {
      id: SYSTEM_IDS.EDGE_CHILD_OF,
      typeId: SYSTEM_EDGE_TYPES.CHILD_OF,
      name: 'Child Of',
      description: 'Indicates a hierarchical parent-child relationship.',
      properties: [
        {
          name: 'position',
          valueKind: 'text',
          required: true,
          description: 'Fractional index position',
        },
      ],
    },
    {
      id: SYSTEM_IDS.EDGE_DEFINES,
      typeId: SYSTEM_EDGE_TYPES.DEFINES,
      name: 'Defines',
      description: 'Indicates that the source node defines the target node.',
    },
    {
      id: SYSTEM_IDS.EDGE_REFERENCES,
      typeId: SYSTEM_EDGE_TYPES.REFERENCES,
      name: 'References',
      description: 'Indicates a general reference or link.',
    },
    {
      id: SYSTEM_IDS.EDGE_PREREQUISITE,
      typeId: SYSTEM_EDGE_TYPES.PREREQUISITE,
      name: 'Prerequisite',
      description: 'Indicates that the target is a prerequisite for the source.',
    },
  ] as const;

  // 6. System Queries
  const systemQueries = [
    {
      id: SYSTEM_IDS.QUERY_ALL_NODES,
      name: 'All Nodes',
      description: 'Finds all nodes in the graph.',
      definition: { steps: [{ kind: 'node-scan' }] },
    },
    {
      id: SYSTEM_IDS.QUERY_BY_TYPE,
      name: 'By Type',
      description: 'Finds all nodes, intended for grouping by type.',
      definition: {
        steps: [
          { kind: 'node-scan' },
          { kind: 'sort', sort: { property: 'type', direction: 'asc' } },
        ],
      },
    },
    {
      id: SYSTEM_IDS.QUERY_RECENT,
      name: 'Recent',
      description: 'Finds all nodes sorted by modification time.',
      definition: {
        steps: [
          { kind: 'node-scan' },
          { kind: 'sort', sort: { property: 'metadata.modified', direction: 'desc' } },
        ],
      },
    },
  ];

  // 6. System Views
  const systemViews = [
    {
      id: SYSTEM_IDS.VIEW_ALL_NODES,
      name: 'All Nodes',
      description: 'List of all nodes.',
      layout: 'table',
      queryRef: SYSTEM_IDS.QUERY_ALL_NODES,
    },
    {
      id: SYSTEM_IDS.VIEW_BY_TYPE,
      name: 'By Type',
      description: 'Nodes grouped by type.',
      layout: 'list',
      groupBy: 'type',
      queryRef: SYSTEM_IDS.QUERY_BY_TYPE,
    },
    {
      id: SYSTEM_IDS.VIEW_RECENT,
      name: 'Recent',
      description: 'Recently modified nodes.',
      layout: 'cards',
      queryRef: SYSTEM_IDS.QUERY_RECENT,
    },
  ];

  // 7. System Settings Schemas
  const systemSettings = [
    {
      id: SYSTEM_IDS.SETTING_DEFAULT_RENDERER,
      key: 'default-renderer',
      valueKind: 'reference',
      defaultValue: 'null',
      description: 'The default renderer node to use for a given scope.',
      scopes: '["node","type","namespace","global"]',
      namespace: 'system',
    },
    {
      id: SYSTEM_IDS.SETTING_DISPLAY_DENSITY,
      key: 'display-density',
      valueKind: 'text',
      defaultValue: '"comfortable"',
      description: 'UI display density: comfortable, compact, or spacious.',
      scopes: '["global"]',
      namespace: 'system',
    },
  ] as const;

  // Chain everything
  const allSteps: readonly ((g: Graph) => Result<Graph, Error>)[] = [
    ...steps,
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
          const extraProps: Record<string, import('@canopy/types').PropertyValue> = props
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
              ...(def.groupBy ? { groupBy: text(def.groupBy) } : {}),
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
  ];

  return reduceResult(allSteps, (g, step) => step(g), graph);
}
