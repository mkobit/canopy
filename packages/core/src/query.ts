import type { Graph, Node, Edge, NodeId, EdgeId, TypeId } from '@canopy/types'
import { filter } from 'remeda'

/**
 * Retrieves a node by ID.
 */
export function getNode(graph: Graph, id: NodeId): Node | undefined {
  return graph.nodes.get(id)
}

/**
 * Retrieves an edge by ID.
 */
export function getEdge(graph: Graph, id: EdgeId): Edge | undefined {
  return graph.edges.get(id)
}

/**
 * Retrieves all nodes of a given type.
 */
export function getNodesByType(graph: Graph, type: TypeId): readonly Node[] {
  return filter(
      Array.from(graph.nodes.values()),
      node => node.type === type,
  )
}

/**
 * Retrieves all edges outgoing from a node.
 */
export function getEdgesFrom(graph: Graph, nodeId: NodeId): readonly Edge[] {
  return filter(
      Array.from(graph.edges.values()),
      edge => edge.source === nodeId,
  )
}

/**
 * Retrieves all edges incoming to a node.
 */
export function getEdgesTo(graph: Graph, nodeId: NodeId): readonly Edge[] {
  return filter(
      Array.from(graph.edges.values()),
      edge => edge.target === nodeId,
  )
}
