import type { Graph, Node, PropertyMap, TypeId, NodeId, PropertyValue } from '@canopy/types'
import { createInstant } from '@canopy/types'
import { addNode } from './ops'
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from './system'
import { reduce } from 'remeda'

// Helper to create a property map
function createProperties(props: Record<string, PropertyValue>): PropertyMap {
  return new Map(Object.entries(props))
}

// Helper to create a text value
function text(value: string): PropertyValue {
  return { kind: 'text', value }
}

function createBootstrapNode(
  id: NodeId,
  type: TypeId,
  name: string,
  description: string,
  extraProps: Record<string, PropertyValue> = {}
): Node {
  return {
    id,
    type,
    properties: createProperties({
      name: text(name),
      description: text(description),
      ...extraProps
    }),
    metadata: {
      created: createInstant(),
      modified: createInstant()
    }
  }
}

/**
 * Bootstraps a graph with system nodes.
 * This is idempotent - it only adds nodes if they are missing.
 */
export function bootstrap(graph: Graph): Graph {
  let g = graph

  // 1. Ensure NodeType definition exists
  if (!g.nodes.has(SYSTEM_IDS.NODE_TYPE_DEF)) {
    g = addNode(g, createBootstrapNode(
      SYSTEM_IDS.NODE_TYPE_DEF,
      SYSTEM_IDS.NODE_TYPE,
      'Node Type',
      'Defines a type of node in the graph.',
      {
         // We might want to add validOutgoingEdges etc here later
      }
    ))
  }

  // 2. Ensure EdgeType definition exists
  if (!g.nodes.has(SYSTEM_IDS.EDGE_TYPE_DEF)) {
    g = addNode(g, createBootstrapNode(
      SYSTEM_IDS.EDGE_TYPE_DEF,
      SYSTEM_IDS.NODE_TYPE, // An EdgeType definition is a Node of type NodeType
      'Edge Type',
      'Defines a type of edge in the graph.',
      {
          // EdgeType specific properties could be defined here as defaults
      }
    ))
  }

  // 3. Core Edge Types
  const coreEdgeTypes = [
    {
      id: SYSTEM_IDS.EDGE_CHILD_OF,
      typeId: SYSTEM_EDGE_TYPES.CHILD_OF,
      name: 'Child Of',
      description: 'Indicates a hierarchical parent-child relationship.'
    },
    {
      id: SYSTEM_IDS.EDGE_DEFINES,
      typeId: SYSTEM_EDGE_TYPES.DEFINES,
      name: 'Defines',
      description: 'Indicates that the source node defines the target node.'
    },
    {
      id: SYSTEM_IDS.EDGE_REFERENCES,
      typeId: SYSTEM_EDGE_TYPES.REFERENCES,
      name: 'References',
      description: 'Indicates a general reference or link.'
    },
    {
      id: SYSTEM_IDS.EDGE_PREREQUISITE,
      typeId: SYSTEM_EDGE_TYPES.PREREQUISITE,
      name: 'Prerequisite',
      description: 'Indicates that the target is a prerequisite for the source.'
    }
  ]

  g = reduce(
    coreEdgeTypes,
    (currentGraph, def) => {
      if (!currentGraph.nodes.has(def.id)) {
        return addNode(currentGraph, createBootstrapNode(
          def.id,
          SYSTEM_IDS.EDGE_TYPE, // These are definitions of edge types
          def.name,
          def.description
        ))
      }
      return currentGraph
    },
    g
  )

  return g
}
