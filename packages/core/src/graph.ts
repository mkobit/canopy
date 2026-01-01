import type { Graph, Node, Edge, NodeId, EdgeId, TypeId, PropertyMap, GraphId } from '@canopy/types'
import { createNodeId, createEdgeId, createInstant, createGraphId } from '@canopy/types'

// Re-export types for convenience
export type { Graph, Node, Edge }

/**
 * Creates a new empty graph.
 */
export function createGraph(id: GraphId, name: string): Graph {
  return {
    id,
    name,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
    },
    nodes: new Map(),
    edges: new Map(),
  }
}

/**
 * Adds a node to the graph.
 * Returns a new graph with the node added.
 * Throws if a node with the same ID already exists.
 */
export function addNode(graph: Graph, node: Node): Graph {
  if (graph.nodes.has(node.id)) {
    throw new Error(`Node with ID ${node.id} already exists`)
  }

  const newNodes = new Map(graph.nodes)
  newNodes.set(node.id, node)

  return {
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  }
}

/**
 * Removes a node from the graph.
 * Also removes any edges connected to the node.
 * Returns a new graph.
 */
export function removeNode(graph: Graph, nodeId: NodeId): Graph {
  if (!graph.nodes.has(nodeId)) {
    return graph
  }

  const newNodes = new Map(graph.nodes)
  newNodes.delete(nodeId)

  // Remove connected edges
  const newEdges = new Map<EdgeId, Edge>()
  for (const [edgeId, edge] of graph.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) {
      newEdges.set(edgeId, edge)
    }
  }

  return {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  }
}

/**
 * Updates a node in the graph using a functional updater.
 * Returns a new graph.
 * Throws if the node does not exist.
 */
export function updateNode(graph: Graph, nodeId: NodeId, updater: (node: Node) => Node): Graph {
  const existingNode = graph.nodes.get(nodeId)
  if (!existingNode) {
    throw new Error(`Node with ID ${nodeId} not found`)
  }

  const updatedNode = updater(existingNode)

  // Ensure ID hasn't changed
  if (updatedNode.id !== nodeId) {
      throw new Error(`Cannot change node ID during update`)
  }

  const newNodes = new Map(graph.nodes)
  newNodes.set(nodeId, {
      ...updatedNode,
      metadata: {
          ...updatedNode.metadata,
          modified: createInstant()
      }
  })

  return {
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  }
}

/**
 * Adds an edge to the graph.
 * Returns a new graph.
 * Throws if source or target nodes do not exist.
 */
export function addEdge(graph: Graph, edge: Edge): Graph {
  if (graph.edges.has(edge.id)) {
    throw new Error(`Edge with ID ${edge.id} already exists`)
  }
  if (!graph.nodes.has(edge.source)) {
    throw new Error(`Source node ${edge.source} not found`)
  }
  if (!graph.nodes.has(edge.target)) {
    throw new Error(`Target node ${edge.target} not found`)
  }

  const newEdges = new Map(graph.edges)
  newEdges.set(edge.id, edge)

  return {
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  }
}

/**
 * Removes an edge from the graph.
 * Returns a new graph.
 */
export function removeEdge(graph: Graph, edgeId: EdgeId): Graph {
  if (!graph.edges.has(edgeId)) {
    return graph
  }

  const newEdges = new Map(graph.edges)
  newEdges.delete(edgeId)

  return {
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  }
}

/**
 * Updates an edge in the graph using a functional updater.
 * Returns a new graph.
 * Throws if the edge does not exist.
 */
export function updateEdge(graph: Graph, edgeId: EdgeId, updater: (edge: Edge) => Edge): Graph {
  const existingEdge = graph.edges.get(edgeId)
  if (!existingEdge) {
    throw new Error(`Edge with ID ${edgeId} not found`)
  }

  const updatedEdge = updater(existingEdge)

  // Ensure ID hasn't changed
  if (updatedEdge.id !== edgeId) {
      throw new Error(`Cannot change edge ID during update`)
  }

  // Verify source/target still exist (in case they were changed, though usually they shouldn't be)
  if (!graph.nodes.has(updatedEdge.source)) {
      throw new Error(`Source node ${updatedEdge.source} not found`)
  }
  if (!graph.nodes.has(updatedEdge.target)) {
      throw new Error(`Target node ${updatedEdge.target} not found`)
  }

  const newEdges = new Map(graph.edges)
  newEdges.set(edgeId, {
      ...updatedEdge,
      metadata: {
          ...updatedEdge.metadata,
          modified: createInstant()
      }
  })

  return {
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  }
}
