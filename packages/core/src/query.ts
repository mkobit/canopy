import type { Graph, Node, Edge, NodeId, EdgeId, TypeId } from '@canopy/types'

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
export function getNodesByType(graph: Graph, type: TypeId): Node[] {
  const result: Node[] = []
  for (const node of graph.nodes.values()) {
    if (node.type === type) {
      result.push(node)
    }
  }
  return result
}

/**
 * Retrieves all edges outgoing from a node.
 */
export function getEdgesFrom(graph: Graph, nodeId: NodeId): Edge[] {
  const result: Edge[] = []
  for (const edge of graph.edges.values()) {
    if (edge.source === nodeId) {
      result.push(edge)
    }
  }
  return result
}

/**
 * Retrieves all edges incoming to a node.
 */
export function getEdgesTo(graph: Graph, nodeId: NodeId): Edge[] {
  const result: Edge[] = []
  for (const edge of graph.edges.values()) {
    if (edge.target === nodeId) {
      result.push(edge)
    }
  }
  return result
}
