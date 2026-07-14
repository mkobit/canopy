import type { Node } from './node';
import type { PropertyMap, PropertyValue, PropertyDefinition } from './properties';
import type { TypeId, NodeId } from './identifiers';
import { createInstant, asDeviceId, asNodeId } from './factories';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system';

export const SYSTEM_DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');

// Helper to create a property map
export function createProperties(props: Record<string, PropertyValue>): PropertyMap {
  return new Map(Object.entries(props));
}

// Helper to create a text value
export function text(value: string): PropertyValue {
  return value;
}

// Helper to create a reference value
export function reference(target: NodeId): PropertyValue {
  return target;
}

export function createBootstrapNode(
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

export const nodeTypeProperties: readonly PropertyDefinition[] = [
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

export const edgeTypeProperties: readonly PropertyDefinition[] = [
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

export const namespaceProperties: readonly PropertyDefinition[] = [
  {
    name: 'name',
    valueKind: 'text',
    required: true,
    description: 'Unique name identifying this namespace.',
  },
  {
    name: 'description',
    valueKind: 'text',
    required: false,
    description: 'A description of the namespace.',
  },
  {
    name: 'kind',
    valueKind: 'text',
    required: true,
    description: 'Open classification of this namespace (e.g. system, user, imported).',
  },
];

export const propertyTypeProperties: readonly PropertyDefinition[] = [
  {
    name: 'name',
    valueKind: 'text',
    required: true,
    description: 'The name of the property.',
  },
  {
    name: 'valueKind',
    valueKind: 'text',
    required: true,
    description: 'The value kind this property holds.',
  },
  {
    name: 'description',
    valueKind: 'text',
    required: false,
    description: 'A description of the property type.',
  },
];

// Migration: the 4 previously-hardcoded namespace strings become real Namespace nodes.
export const namespaceMigrations = [
  {
    id: SYSTEM_IDS.NAMESPACE_SYSTEM,
    name: 'system',
    kind: 'system',
    description: 'Namespace for system-owned definitions and metadata.',
  },
  {
    id: SYSTEM_IDS.NAMESPACE_USER,
    name: 'user',
    kind: 'user',
    description: 'Default namespace for user-created content.',
  },
  {
    id: SYSTEM_IDS.NAMESPACE_IMPORTED,
    name: 'imported',
    kind: 'imported',
    description: 'Namespace for content imported from external sources.',
  },
  {
    id: SYSTEM_IDS.NAMESPACE_USER_SETTINGS,
    name: 'user-settings',
    kind: 'user-settings',
    description: 'Namespace for user setting override nodes.',
  },
] as const;

// Core Node Types (Content Blocks and Settings)
export const coreNodeTypes = [
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
    ] satisfies readonly PropertyDefinition[],
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
    ] satisfies readonly PropertyDefinition[],
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
    ] satisfies readonly PropertyDefinition[],
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
    ] satisfies readonly PropertyDefinition[],
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
    ] satisfies readonly PropertyDefinition[],
  },
  {
    id: SYSTEM_IDS.WORKFLOW_TRIGGER,
    name: 'WorkflowTrigger',
    description: 'A trigger for a workflow execution.',
    properties: [
      {
        name: 'name',
        valueKind: 'text',
        required: true,
        description: 'Trigger name',
      },
      {
        name: 'eventType',
        valueKind: 'text',
        required: true,
        description: 'Type of event that fires this trigger',
      },
      {
        name: 'condition',
        valueKind: 'text',
        required: false,
        description: 'Condition expression (JSON)',
      },
      {
        name: 'workflowRef',
        valueKind: 'reference',
        required: true,
        description: 'Workflow to trigger',
      },
    ] satisfies readonly PropertyDefinition[],
  },
  {
    id: SYSTEM_IDS.WORKFLOW_DEFINITION,
    name: 'WorkflowDefinition',
    description: 'A definition of a workflow.',
    properties: [] satisfies readonly PropertyDefinition[],
  },
] as const;

// Core Edge Types
export const coreEdgeTypes = [
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
    ] satisfies readonly PropertyDefinition[],
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
  {
    id: SYSTEM_IDS.EDGE_USES_RENDERER,
    typeId: SYSTEM_EDGE_TYPES.USES_RENDERER,
    name: 'uses_renderer',
    description: 'Links a ViewDefinition to a Renderer.',
  },
  {
    id: SYSTEM_IDS.EDGE_VIEW_OVERRIDE,
    typeId: SYSTEM_EDGE_TYPES.VIEW_OVERRIDE,
    name: 'view_override',
    description: 'Links a node to a ViewDefinition that overrides its default view.',
  },
  {
    id: SYSTEM_IDS.EDGE_DEFAULT_VIEW,
    typeId: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
    name: 'default_view',
    description: 'Links a NodeType to a ViewDefinition that defines its default view.',
  },
] as const;

// System Queries
export const systemQueries = [
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
] as const;

// System Views
export const systemViews = [
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
] as const;

// System Settings Schemas
export const systemSettings = [
  {
    id: SYSTEM_IDS.SETTING_DEFAULT_VIEW,
    key: 'default-view',
    valueKind: 'reference',
    defaultValue: 'null',
    description: 'The default view definition node to use for a given scope.',
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

// System Renderers
export const systemRenderers = [
  {
    id: asNodeId('system:renderer:text'),
    name: 'Text Renderer',
    description: 'Renders plain text',
    rendererKind: 'system',
    entryPoint: 'system:text' as const,
    permissions: [] as readonly string[],
    namespace: 'system',
  },
  {
    id: asNodeId('system:renderer:code'),
    name: 'Code Renderer',
    description: 'Renders source code',
    rendererKind: 'system',
    entryPoint: 'system:code' as const,
    permissions: [] as readonly string[],
    namespace: 'system',
  },
  {
    id: asNodeId('system:renderer:markdown'),
    name: 'Markdown Renderer',
    description: 'Renders markdown document',
    rendererKind: 'system',
    entryPoint: 'system:markdown' as const,
    permissions: [] as readonly string[],
    namespace: 'system',
  },
] as const;

// Default View Definitions
export const defaultViews = [
  {
    id: asNodeId('system:view:text-block'),
    name: 'Text Block View',
    description: 'Default view for text blocks',
    layout: 'document',
    namespace: 'system',
  },
  {
    id: asNodeId('system:view:code-block'),
    name: 'Code Block View',
    description: 'Default view for code blocks',
    layout: 'document',
    namespace: 'system',
  },
  {
    id: asNodeId('system:view:markdown'),
    name: 'Markdown View',
    description: 'Default view for markdown content',
    layout: 'document',
    namespace: 'system',
  },
] as const;

export const rendererProperties: readonly PropertyDefinition[] = [
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
];

export const queryDefinitionProperties: readonly PropertyDefinition[] = [
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
];

export const viewDefinitionProperties: readonly PropertyDefinition[] = [
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
    required: false,
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
];

export const templateProperties: readonly PropertyDefinition[] = [
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
];
