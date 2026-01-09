import type { Graph, Node, PropertyMap, TypeId, NodeId, PropertyValue, PropertyDefinition } from '@canopy/types'
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

// Helper to create a reference value
function reference(target: NodeId): PropertyValue {
  return { kind: 'reference', target }
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
  // 1. Ensure NodeType definition exists
  const g1 = !graph.nodes.has(SYSTEM_IDS.NODE_TYPE_DEF)
    ? addNode(graph, createBootstrapNode(
        SYSTEM_IDS.NODE_TYPE_DEF,
        SYSTEM_IDS.NODE_TYPE,
        'Node Type',
        'Defines a type of node in the graph.'
      ))
    : graph

  // 2. Ensure EdgeType definition exists
  const g2 = !g1.nodes.has(SYSTEM_IDS.EDGE_TYPE_DEF)
    ? addNode(g1, createBootstrapNode(
        SYSTEM_IDS.EDGE_TYPE_DEF,
        SYSTEM_IDS.NODE_TYPE, // An EdgeType definition is a Node of type NodeType
        'Edge Type',
        'Defines a type of edge in the graph.'
      ))
    : g1

  const g3 = !g2.nodes.has(SYSTEM_IDS.QUERY_DEFINITION_DEF)
    ? addNode(g2, createBootstrapNode(
        SYSTEM_IDS.QUERY_DEFINITION_DEF,
        SYSTEM_IDS.NODE_TYPE,
        'Query Definition',
        'Defines a stored query in the graph.',
        {
          properties: text(JSON.stringify([
              { name: 'name', valueKind: 'text', required: true, description: 'Human-readable query name' },
              { name: 'description', valueKind: 'text', required: false, description: 'What this query finds' },
              { name: 'nodeTypes', valueKind: 'list', required: false, description: 'Which node types this query targets' },
              { name: 'definition', valueKind: 'text', required: true, description: 'The query in stored format (JSON)' },
              { name: 'parameters', valueKind: 'list', required: false, description: 'Declared parameter names this query accepts' }
          ] satisfies readonly PropertyDefinition[]))
        }
      ))
    : g2

  const g4 = !g3.nodes.has(SYSTEM_IDS.VIEW_DEFINITION_DEF)
    ? addNode(g3, createBootstrapNode(
        SYSTEM_IDS.VIEW_DEFINITION_DEF,
        SYSTEM_IDS.NODE_TYPE,
        'View Definition',
        'Defines a view of data in the graph.',
        {
          properties: text(JSON.stringify([
              { name: 'name', valueKind: 'text', required: true, description: 'Human-readable view name' },
              { name: 'description', valueKind: 'text', required: false, description: 'What this view shows' },
              { name: 'queryRef', valueKind: 'reference', required: true, description: 'Reference to a QueryDefinition node' },
              { name: 'layout', valueKind: 'text', required: true, description: 'list | table | cards | graph | document' },
              { name: 'sort', valueKind: 'text', required: false, description: 'JSON string of sort criteria' },
              { name: 'groupBy', valueKind: 'text', required: false, description: 'Property name to group results' },
              { name: 'displayProperties', valueKind: 'list', required: false, description: 'Properties to show' },
              { name: 'pageSize', valueKind: 'number', required: false, description: 'Number of items per page' }
          ] satisfies readonly PropertyDefinition[]))
        }
      ))
    : g3

  const g5 = !g4.nodes.has(SYSTEM_IDS.TEMPLATE_DEF)
    ? addNode(g4, createBootstrapNode(
        SYSTEM_IDS.TEMPLATE_DEF,
        SYSTEM_IDS.NODE_TYPE,
        'Template',
        'Defines a UI template.',
        {
          properties: text(JSON.stringify([
              { name: 'name', valueKind: 'text', required: true, description: 'Template name' },
              { name: 'layout', valueKind: 'text', required: true, description: 'Layout handled by this template' },
              { name: 'component', valueKind: 'text', required: false, description: 'Component name' }
          ] satisfies readonly PropertyDefinition[]))
        }
      ))
    : g4

  // 4. Core Edge Types
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
  ] as const

  const g6 = reduce(
    coreEdgeTypes,
    (currentGraph: Graph, def): Graph => {
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
    g5
  )

  // 5. System Queries
  const systemQueries = [
    {
      id: SYSTEM_IDS.QUERY_ALL_NODES,
      name: 'All Nodes',
      description: 'Finds all nodes in the graph.',
      definition: { steps: [{ kind: 'node-scan' }] }
    },
    {
      id: SYSTEM_IDS.QUERY_BY_TYPE,
      name: 'By Type',
      description: 'Finds all nodes, intended for grouping by type.',
      definition: { steps: [{ kind: 'node-scan' }, { kind: 'sort', sort: { property: 'type', direction: 'asc' } }] }
    },
    {
      id: SYSTEM_IDS.QUERY_RECENT,
      name: 'Recent',
      description: 'Finds all nodes sorted by modification time.',
      definition: { steps: [{ kind: 'node-scan' }, { kind: 'sort', sort: { property: 'metadata.modified', direction: 'desc' } }] }
    }
  ]

  const g7 = reduce(
    systemQueries,
    (currentGraph: Graph, def): Graph => {
      if (!currentGraph.nodes.has(def.id)) {
        return addNode(currentGraph, createBootstrapNode(
          def.id,
          SYSTEM_IDS.QUERY_DEFINITION,
          def.name,
          def.description,
          {
            definition: text(JSON.stringify(def.definition))
          }
        ))
      }
      return currentGraph
    },
    g6
  )

  // 6. System Views
  const systemViews = [
    {
      id: SYSTEM_IDS.VIEW_ALL_NODES,
      name: 'All Nodes',
      description: 'List of all nodes.',
      layout: 'table',
      queryRef: SYSTEM_IDS.QUERY_ALL_NODES
    },
    {
      id: SYSTEM_IDS.VIEW_BY_TYPE,
      name: 'By Type',
      description: 'Nodes grouped by type.',
      layout: 'list',
      groupBy: 'type',
      queryRef: SYSTEM_IDS.QUERY_BY_TYPE
    },
    {
      id: SYSTEM_IDS.VIEW_RECENT,
      name: 'Recent',
      description: 'Recently modified nodes.',
      layout: 'cards',
      queryRef: SYSTEM_IDS.QUERY_RECENT
    }
  ]

  const g8 = reduce(
    systemViews,
    (currentGraph: Graph, def): Graph => {
      if (!currentGraph.nodes.has(def.id)) {
        const extraProps = {
          layout: text(def.layout),
          queryRef: reference(def.queryRef),
          ...(def.groupBy ? { groupBy: text(def.groupBy) } : {})
        }
        return addNode(currentGraph, createBootstrapNode(
          def.id,
          SYSTEM_IDS.VIEW_DEFINITION,
          def.name,
          def.description,
          extraProps
        ))
      }
      return currentGraph
    },
    g7
  )

  return g8
}
