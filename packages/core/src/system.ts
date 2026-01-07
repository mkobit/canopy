import { asNodeId, asTypeId } from '@canopy/types'

export const SYSTEM_IDS = {
  // Types
  NODE_TYPE: asTypeId('node:type:node-type'),
  EDGE_TYPE: asTypeId('node:type:edge-type'),
  QUERY_DEFINITION: asTypeId('node:type:query-definition'),

  // Node Type Definitions (these nodes define the types above)
  NODE_TYPE_DEF: asNodeId('node:type:node-type'),
  EDGE_TYPE_DEF: asNodeId('node:type:edge-type'),
  QUERY_DEFINITION_DEF: asNodeId('node:type:query-definition'),

  // Edge Type Definitions (nodes that define edge types)
  EDGE_CHILD_OF: asNodeId('edge:type:child-of'),
  EDGE_DEFINES: asNodeId('edge:type:defines'),
  EDGE_REFERENCES: asNodeId('edge:type:references'),
  EDGE_PREREQUISITE: asNodeId('edge:type:prerequisite'),
}

// Corresponding TypeIds for the Edge Types
export const SYSTEM_EDGE_TYPES = {
  CHILD_OF: asTypeId('edge:type:child-of'),
  DEFINES: asTypeId('edge:type:defines'),
  REFERENCES: asTypeId('edge:type:references'),
  PREREQUISITE: asTypeId('edge:type:prerequisite'),
}
