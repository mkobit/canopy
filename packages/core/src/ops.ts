import type { Graph, Node, Edge, NodeId, EdgeId, Result } from '@canopy/types'
import { createInstant, ok, err } from '@canopy/types'
import { validateNode, validateEdge } from './validation'

export type GraphOperationOptions = Readonly<{
  validate?: boolean
}>

/**
 * Adds a node to the graph.
 * Returns a new graph with the node added.
 * Returns Error if a node with the same ID already exists.
 */
export function addNode(graph: Graph, node: Node, options: GraphOperationOptions = {}): Result<Graph, Error> {
  if (graph.nodes.has(node.id)) {
    return err(new Error(`Node with ID ${node.id} already exists`))
  }

  if (options.validate) {
    const result = validateNode(graph, node)
    if (!result.valid) {
      const msgs = result.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return err(new Error(`Node validation failed: ${msgs}`))
    }
  }

  const newNodes = new Map([...graph.nodes, [node.id, node]])

  return ok({
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  })
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

  const newNodes = new Map([...graph.nodes].filter(([id]) => id !== nodeId))

  // Remove connected edges
  const newEdges = new Map(
    [...graph.edges].filter(([_id, edge]) => edge.source !== nodeId && edge.target !== nodeId),
  )

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
 * Returns Error if the node does not exist.
 */
export function updateNode(graph: Graph, nodeId: NodeId, updater: (node: Node) => Node, options: GraphOperationOptions = {}): Result<Graph, Error> {
  const existingNode = graph.nodes.get(nodeId)
  if (!existingNode) {
    return err(new Error(`Node with ID ${nodeId} not found`))
  }

  const updatedNode = updater(existingNode)

  // Ensure ID hasn't changed
  if (updatedNode.id !== nodeId) {
      return err(new Error(`Cannot change node ID during update`))
  }

  if (options.validate) {
    // Note: We validate the updated node against the ORIGINAL graph to find the type definition.
    // If the type definition itself is being updated, this might be tricky (validating against old graph vs new graph).
    // For now, validating against current graph is safe for type constraints.
    // However, if the update *changes* the type of the node, we should use the new type.
    const result = validateNode(graph, updatedNode)
    if (!result.valid) {
      const msgs = result.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
      return err(new Error(`Node validation failed: ${msgs}`))
    }
  }

  const newNodes = new Map(Array.from(graph.nodes).map(([id, node]) => {
    if (id === nodeId) {
      return [id, {
        ...updatedNode,
        metadata: {
          ...updatedNode.metadata,
          modified: createInstant()
        }
      }]
    }
    return [id, node]
  }))

  return ok({
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  })
}

/**
 * Adds an edge to the graph.
 * Returns a new graph.
 * Returns Error if source or target nodes do not exist.
 */
export function addEdge(graph: Graph, edge: Edge, options: GraphOperationOptions = {}): Result<Graph, Error> {
  if (graph.edges.has(edge.id)) {
    return err(new Error(`Edge with ID ${edge.id} already exists`))
  }
  if (!graph.nodes.has(edge.source)) {
    return err(new Error(`Source node ${edge.source} not found`))
  }
  if (!graph.nodes.has(edge.target)) {
    return err(new Error(`Target node ${edge.target} not found`))
  }

  if (options.validate) {
    const result = validateEdge(graph, edge)
    if (!result.valid) {
       const msgs = result.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
       return err(new Error(`Edge validation failed: ${msgs}`))
    }
  }

  const newEdges = new Map([...graph.edges, [edge.id, edge]])

  return ok({
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  })
}

/**
 * Removes an edge from the graph.
 * Returns a new graph.
 */
export function removeEdge(graph: Graph, edgeId: EdgeId): Graph {
  if (!graph.edges.has(edgeId)) {
    return graph
  }

  const newEdges = new Map([...graph.edges].filter(([id]) => id !== edgeId))

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
 * Returns Error if the edge does not exist.
 */
export function updateEdge(graph: Graph, edgeId: EdgeId, updater: (edge: Edge) => Edge, options: GraphOperationOptions = {}): Result<Graph, Error> {
  const existingEdge = graph.edges.get(edgeId)
  if (!existingEdge) {
    return err(new Error(`Edge with ID ${edgeId} not found`))
  }

  const updatedEdge = updater(existingEdge)

  // Ensure ID hasn't changed
  if (updatedEdge.id !== edgeId) {
      return err(new Error(`Cannot change edge ID during update`))
  }

  // Verify source/target still exist (in case they were changed, though usually they shouldn't be)
  if (!graph.nodes.has(updatedEdge.source)) {
      return err(new Error(`Source node ${updatedEdge.source} not found`))
  }
  if (!graph.nodes.has(updatedEdge.target)) {
      return err(new Error(`Target node ${updatedEdge.target} not found`))
  }

  if (options.validate) {
    const result = validateEdge(graph, updatedEdge)
    if (!result.valid) {
       const msgs = result.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')
       return err(new Error(`Edge validation failed: ${msgs}`))
    }
  }

  const newEdges = new Map(Array.from(graph.edges).map(([id, edge]) => {
    if (id === edgeId) {
      return [id, {
        ...updatedEdge,
        metadata: {
          ...updatedEdge.metadata,
          modified: createInstant()
        }
      }]
    }
    return [id, edge]
  }))

  return ok({
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  })
}
