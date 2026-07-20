import { asNodeId, asTypeId } from './factories';

export const SYSTEM_IDS = {
  // Types
  NODE_TYPE: asTypeId('node:type:node-type'),
  EDGE_TYPE: asTypeId('node:type:edge-type'),
  NAMESPACE: asTypeId('node:type:namespace'),
  PROPERTY_TYPE: asTypeId('node:type:property-type'),
  QUERY_DEFINITION: asTypeId('node:type:query-definition'),
  VIEW_DEFINITION: asTypeId('node:type:view-definition'),
  TEMPLATE: asTypeId('node:type:template'),
  RENDERER: asTypeId('meta:renderer'),

  // Node Type Definitions (these nodes define the types above)
  NODE_TYPE_DEF: asNodeId('node:type:node-type'),
  EDGE_TYPE_DEF: asNodeId('node:type:edge-type'),
  NAMESPACE_DEF: asNodeId('node:type:namespace'),
  PROPERTY_TYPE_DEF: asNodeId('node:type:property-type'),
  QUERY_DEFINITION_DEF: asNodeId('node:type:query-definition'),
  VIEW_DEFINITION_DEF: asNodeId('node:type:view-definition'),
  TEMPLATE_DEF: asNodeId('node:type:template'),
  RENDERER_DEF: asNodeId('meta:renderer'),

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
  TYPE_PLUGIN: asTypeId('system:nodetype:plugin'),

  // System settings schemas
  SETTING_DEFAULT_VIEW: asNodeId('system:setting:default-view'),
  SETTING_DISPLAY_DENSITY: asNodeId('system:setting:display-density'),

  // Node Type Definitions for Block Content
  NODE_TYPE_TEXT_BLOCK: asNodeId('system:nodetype:text-block'),
  NODE_TYPE_CODE_BLOCK: asNodeId('system:nodetype:code-block'),
  NODE_TYPE_MARKDOWN: asNodeId('system:nodetype:markdown'),
  TYPE_TEXT_BLOCK: asTypeId('system:nodetype:text-block'),
  TYPE_CODE_BLOCK: asTypeId('system:nodetype:code-block'),
  TYPE_MARKDOWN: asTypeId('system:nodetype:markdown'),

  // Workflow definitions
  WORKFLOW_TRIGGER: asNodeId('system:nodetype:workflow-trigger'),
  WORKFLOW_DEFINITION: asNodeId('system:nodetype:workflow-definition'),

  // Edge Type Definitions (nodes that define edge types)
  EDGE_CHILD_OF: asNodeId('system:edgetype:child-of'),
  EDGE_DEFINES: asNodeId('edge:type:defines'),
  EDGE_REFERENCES: asNodeId('edge:type:references'),
  EDGE_PREREQUISITE: asNodeId('edge:type:prerequisite'),
  EDGE_USES_RENDERER: asNodeId('system:edgetype:uses-renderer'),
  EDGE_VIEW_OVERRIDE: asNodeId('system:edgetype:view-override'),
  EDGE_DEFAULT_VIEW: asNodeId('system:edgetype:default-view'),

  SETTINGS_SCHEMA: asTypeId('system:nodetype:settings-schema'),
  USER_SETTING: asTypeId('system:nodetype:user-setting'),
};

// Corresponding TypeIds for the Edge Types
export const SYSTEM_EDGE_TYPES = {
  CHILD_OF: asTypeId('system:edgetype:child-of'),
  DEFINES: asTypeId('edge:type:defines'),
  REFERENCES: asTypeId('edge:type:references'),
  PREREQUISITE: asTypeId('edge:type:prerequisite'),
  USES_RENDERER: asTypeId('system:edgetype:uses-renderer'),
  VIEW_OVERRIDE: asTypeId('system:edgetype:view-override'),
  DEFAULT_VIEW: asTypeId('system:edgetype:default-view'),
};

export type SystemRendererEntryPoint = 'system:text' | 'system:code' | 'system:markdown';
