import type { NodeId } from './identifiers';
import { asNodeId, asPropertyTypeId, asShapeId } from './factories';

export const SYSTEM_IDS = {
  // Meta-shapes and system shapes
  SHAPE: asShapeId('node:type:shape'),
  NAMESPACE: asShapeId('node:type:namespace'),
  PROPERTY_TYPE: asShapeId('node:type:property-type'),
  QUERY_DEFINITION: asShapeId('node:type:query-definition'),
  VIEW_DEFINITION: asShapeId('node:type:view-definition'),
  TEMPLATE: asShapeId('node:type:template'),
  RENDERER: asShapeId('meta:renderer'),

  // Shape Definition Nodes (these nodes define the shapes above)
  SHAPE_DEF: asNodeId('node:type:shape'),
  NAMESPACE_DEF: asNodeId('node:type:namespace'),
  PROPERTY_TYPE_DEF: asNodeId('node:type:property-type'),
  QUERY_DEFINITION_DEF: asNodeId('node:type:query-definition'),
  VIEW_DEFINITION_DEF: asNodeId('node:type:view-definition'),
  TEMPLATE_DEF: asNodeId('node:type:template'),
  RENDERER_DEF: asNodeId('meta:renderer'),

  // System PropertyTypes
  PROPERTY_TYPE_URL: asPropertyTypeId('system:propertytype:url'),

  // System Queries
  QUERY_ALL_NODES: asNodeId('query:system:all-nodes'),
  QUERY_BY_TYPE: asNodeId('query:system:by-type'),
  QUERY_RECENT: asNodeId('query:system:recent'),

  // System Views
  VIEW_ALL_NODES: asNodeId('view:system:all-nodes'),
  VIEW_BY_TYPE: asNodeId('view:system:by-type'),
  VIEW_RECENT: asNodeId('view:system:recent'),

  // Namespace instance nodes (migrated from the old 4-literal enum)
  NAMESPACE_SYSTEM: asNodeId('namespace:system'),
  NAMESPACE_USER: asNodeId('namespace:user'),
  NAMESPACE_IMPORTED: asNodeId('namespace:imported'),
  NAMESPACE_USER_SETTINGS: asNodeId('namespace:user-settings'),

  // Settings type definitions
  SETTINGS_SCHEMA_DEF: asNodeId('system:nodetype:settings-schema'),
  USER_SETTING_DEF: asNodeId('system:nodetype:user-setting'),

  // Plugin type definitions
  NODE_TYPE_PLUGIN: asNodeId('system:nodetype:plugin'),
  TYPE_PLUGIN: asShapeId('system:nodetype:plugin'),

  // System settings schemas
  SETTING_DEFAULT_VIEW: asNodeId('system:setting:default-view'),
  SETTING_DISPLAY_DENSITY: asNodeId('system:setting:display-density'),

  // Node Shape Definitions for Block Content & Lineage
  NODE_TYPE_TEXT_BLOCK: asNodeId('system:nodetype:text-block'),
  NODE_TYPE_CODE_BLOCK: asNodeId('system:nodetype:code-block'),
  NODE_TYPE_MARKDOWN: asNodeId('system:nodetype:markdown'),
  TYPE_TEXT_BLOCK: asShapeId('system:nodetype:text-block'),
  TYPE_CODE_BLOCK: asShapeId('system:nodetype:code-block'),
  TYPE_MARKDOWN: asShapeId('system:nodetype:markdown'),
  PROXY: asShapeId('system:nodetype:proxy'),
  SHAPE_MIGRATION: asShapeId('system:nodetype:shape-migration'),
  BUNDLE: asShapeId('system:nodetype:bundle'),

  // Workflow definitions
  WORKFLOW_TRIGGER: asNodeId('system:nodetype:workflow-trigger'),
  WORKFLOW_DEFINITION: asNodeId('system:nodetype:workflow-definition'),

  // Edge Shape Definitions (nodes that define edge shapes)
  EDGE_CHILD_OF: asNodeId('system:edgetype:child-of'),
  EDGE_DEFINES: asNodeId('edge:type:defines'),
  EDGE_REFERENCES: asNodeId('edge:type:references'),
  EDGE_PREREQUISITE: asNodeId('edge:type:prerequisite'),
  EDGE_USES_RENDERER: asNodeId('system:edgetype:uses-renderer'),
  EDGE_VIEW_OVERRIDE: asNodeId('system:edgetype:view-override'),
  EDGE_DEFAULT_VIEW: asNodeId('system:edgetype:default-view'),
  EDGE_DERIVED_FROM: asNodeId('system:edgetype:derived-from'),
  EDGE_SUPERSEDES: asNodeId('system:edgetype:supersedes'),
  EDGE_RENDER_SELECTOR: asNodeId('system:edgetype:render-selector'),

  SETTINGS_SCHEMA: asShapeId('system:nodetype:settings-schema'),
  USER_SETTING: asShapeId('system:nodetype:user-setting'),
};

// Corresponding ShapeIds for the Edge Shapes
export const SYSTEM_EDGE_SHAPES = {
  CHILD_OF: asShapeId('system:edgetype:child-of'),
  DEFINES: asShapeId('edge:type:defines'),
  REFERENCES: asShapeId('edge:type:references'),
  PREREQUISITE: asShapeId('edge:type:prerequisite'),
  USES_RENDERER: asShapeId('system:edgetype:uses-renderer'),
  VIEW_OVERRIDE: asShapeId('system:edgetype:view-override'),
  DEFAULT_VIEW: asShapeId('system:edgetype:default-view'),
  DERIVED_FROM: asShapeId('system:edgetype:derived-from'),
  SUPERSEDES: asShapeId('system:edgetype:supersedes'),
  RENDER_SELECTOR: asShapeId('system:edgetype:render-selector'),
};

export type SystemRendererEntryPoint = 'system:text' | 'system:code' | 'system:markdown';

/**
Checks if a NodeId belongs to a system-defined node.
*/
export function isSystemNodeId(nodeId: NodeId | string): boolean {
  const prefixes = [
    'system:',
    'namespace:',
    'node:type:',
    'edge:type:',
    'query:system:',
    'view:system:',
    'meta:',
  ];
  return prefixes.some((prefix) => nodeId.startsWith(prefix));
}
