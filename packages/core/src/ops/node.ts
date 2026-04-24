import type {
  Graph,
  Node,
  Edge,
  NodeId,
  Result,
  GraphResult,
  GraphEvent,
  DeviceId,
  PropertyValue,
} from '@canopy/types';
import { createInstant, createEventId, ok, err } from '@canopy/types';
import { validateNode } from '../validation';

export type NodeOperationOptions = Readonly<{
  deviceId: DeviceId;
  validate?: boolean;
  batchId?: string;
  migrationId?: string;
}>;

/**
 * Adds a node to the graph.
 * Returns a new graph with the node added.
 * Returns Error if a node with the same ID already exists.
 */
export function addNode(
  graph: Graph,
  node: Node,
  options: NodeOperationOptions,
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
      modifiedBy: options.deviceId,
    },
  };

  const event: GraphEvent = {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: node.id,
    nodeType: node.type,
    properties: node.properties,
    timestamp: createInstant(),
    deviceId: options.deviceId,
    ...(options.batchId === undefined ? {} : { batchId: options.batchId }),
    ...(options.migrationId === undefined ? {} : { migrationId: options.migrationId }),
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
export function removeNode(
  graph: Graph,
  nodeId: NodeId,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (!graph.nodes.has(nodeId)) {
    return ok({
      graph,
      events: [],
      value: graph,
    });
  }

  const newNodes = new Map(graph.nodes);
  // eslint-disable-next-line functional/immutable-data
  newNodes.delete(nodeId);

  // Remove connected edges and track events

  const edgesToRemove: Edge[] = [];
  const newEdges = new Map(graph.edges);

  // eslint-disable-next-line functional/no-loop-statements
  for (const edge of graph.edges.values()) {
    if (edge.source === nodeId || edge.target === nodeId) {
      // eslint-disable-next-line functional/immutable-data
      edgesToRemove.push(edge);
      // eslint-disable-next-line functional/immutable-data
      newEdges.delete(edge.id);
    }
  }

  const edgeEvents: readonly GraphEvent[] = edgesToRemove.map((edge) => ({
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id: edge.id,
    timestamp: createInstant(),
    deviceId: options.deviceId,
    ...(options.batchId === undefined ? {} : { batchId: options.batchId }),
    ...(options.migrationId === undefined ? {} : { migrationId: options.migrationId }),
  }));

  const newGraph = {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const nodeEvent: GraphEvent = {
    type: 'NodeDeleted',
    eventId: createEventId(),
    id: nodeId,
    timestamp: createInstant(),
    deviceId: options.deviceId,
    ...(options.batchId === undefined ? {} : { batchId: options.batchId }),
    ...(options.migrationId === undefined ? {} : { migrationId: options.migrationId }),
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
  options: NodeOperationOptions,
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
      modifiedBy: options.deviceId,
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
      modifiedBy: options.deviceId,
    },
  };

  const changes = new Map<string, PropertyValue>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [key, value] of finalNode.properties) {
    const existing = existingNode.properties.get(key);
    if (existing !== value) {
      // eslint-disable-next-line functional/immutable-data
      changes.set(key, value);
    }
  }

  const event: GraphEvent = {
    type: 'NodePropertiesUpdated',
    eventId: createEventId(),
    id: nodeId,
    changes,
    timestamp: createInstant(),
    deviceId: options.deviceId,
    ...(options.batchId === undefined ? {} : { batchId: options.batchId }),
    ...(options.migrationId === undefined ? {} : { migrationId: options.migrationId }),
  };

  return ok({
    graph: newGraph,
    events: [event],
    value: newGraph,
  });
}
