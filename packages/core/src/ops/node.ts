import type { Graph, Node, NodeId, Result } from '@canopy/types';
import { createInstant, ok, err } from '@canopy/types';
import { validateNode } from '../validation';

export type NodeOperationOptions = Readonly<{
  validate?: boolean;
}>;

/**
 * Adds a node to the graph.
 * Returns a new graph with the node added.
 * Returns Error if a node with the same ID already exists.
 */
export function addNode(
  graph: Graph,
  node: Node,
  options: NodeOperationOptions = {},
): Result<Graph, Error> {
  if (graph.nodes.has(node.id)) {
    return err(new Error(`Node with ID ${node.id} already exists`));
  }

  if (options.validate) {
    const result = validateNode(graph, node);
    if (!result.valid) {
      const msgs = result.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return err(new Error(`Node validation failed: ${msgs}`));
    }
  }

  const newNodes = new Map([...graph.nodes, [node.id, node]]);

  return ok({
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  });
}

/**
 * Removes a node from the graph.
 * Also removes any edges connected to the node.
 * Returns a new graph.
 */
export function removeNode(graph: Graph, nodeId: NodeId): Result<Graph, Error> {
  if (!graph.nodes.has(nodeId)) {
    return ok(graph);
  }

  const newNodes = new Map([...graph.nodes].filter(([id]) => id !== nodeId));

  // Remove connected edges
  const newEdges = new Map(
    [...graph.edges].filter(([_id, edge]) => edge.source !== nodeId && edge.target !== nodeId),
  );

  return ok({
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  });
}

/**
 * Updates a node in the graph using a functional updater.
 * Returns a new graph.
 * Returns Error if the node does not exist.
 */
export function updateNode(
  graph: Graph,
  nodeId: NodeId,
  updater: (node: Node) => Node,
  options: NodeOperationOptions = {},
): Result<Graph, Error> {
  const existingNode = graph.nodes.get(nodeId);
  if (!existingNode) {
    return err(new Error(`Node with ID ${nodeId} not found`));
  }

  const updatedNode = updater(existingNode);

  // Ensure ID hasn't changed
  if (updatedNode.id !== nodeId) {
    return err(new Error(`Cannot change node ID during update`));
  }

  if (options.validate) {
    const result = validateNode(graph, updatedNode);
    if (!result.valid) {
      const msgs = result.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return err(new Error(`Node validation failed: ${msgs}`));
    }
  }

  const newNodes = new Map(
    [...graph.nodes].map(([id, node]) => {
      if (id === nodeId) {
        return [
          id,
          {
            ...updatedNode,
            metadata: {
              ...updatedNode.metadata,
              modified: createInstant(),
            },
          },
        ];
      }
      return [id, node];
    }),
  );

  return ok({
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  });
}
