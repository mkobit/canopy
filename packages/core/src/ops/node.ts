import type { Graph, Node, NodeId, Result, GraphResult, GraphEvent } from '@canopy/types';
import { createInstant, createEventId, ok, err } from '@canopy/types';
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
): Result<GraphResult<Graph>, Error> {
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

  const newGraph = {
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  };

  const event: GraphEvent = {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: node.id,
    nodeType: node.type,
    properties: node.properties,
    timestamp: createInstant(),
  };

  return ok({
    graph: newGraph,
    events: [event],
    value: newGraph,
  });
}

/**
 * Removes a node from the graph.
 * Also removes any edges connected to the node.
 * Returns a new graph.
 */
export function removeNode(graph: Graph, nodeId: NodeId): Result<GraphResult<Graph>, Error> {
  if (!graph.nodes.has(nodeId)) {
    return ok({
      graph,
      events: [],
      value: graph,
    });
  }

  const newNodes = new Map([...graph.nodes].filter(([id]) => id !== nodeId));

  // Remove connected edges and track events
  const edgesToRemove = [...graph.edges]
    .map(([, edge]) => edge)
    .filter((edge) => edge.source === nodeId || edge.target === nodeId);

  const edgeEvents: readonly GraphEvent[] = edgesToRemove.map((edge) => ({
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id: edge.id,
    timestamp: createInstant(),
  }));

  const newEdges = new Map(
    [...graph.edges].filter(([_id, edge]) => edge.source !== nodeId && edge.target !== nodeId),
  );

  const newGraph = {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  };

  const nodeEvent: GraphEvent = {
    type: 'NodeDeleted',
    eventId: createEventId(),
    id: nodeId,
    timestamp: createInstant(),
  };

  return ok({
    graph: newGraph,
    events: [nodeEvent, ...edgeEvents],
    value: newGraph,
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
): Result<GraphResult<Graph>, Error> {
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

  const finalNode = {
    ...updatedNode,
    metadata: {
      ...updatedNode.metadata,
      modified: createInstant(),
    },
  };

  const newNodes = new Map(
    [...graph.nodes].map(([id, node]) => {
      if (id === nodeId) {
        return [id, finalNode];
      }
      return [id, node];
    }),
  );

  const newGraph = {
    ...graph,
    nodes: newNodes,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
    },
  };

  const event: GraphEvent = {
    type: 'NodePropertiesUpdated',
    eventId: createEventId(),
    id: nodeId,
    changes: finalNode.properties,
    timestamp: createInstant(),
  };

  return ok({
    graph: newGraph,
    events: [event],
    value: newGraph,
  });
}
