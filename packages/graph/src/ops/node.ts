import type { Graph } from '../graph';
import type { Node } from '../node';
import type { NodeId, DeviceId, BatchId } from '../identifiers';
import type { Result } from '../result';
import type { GraphEvent, GraphResult } from '../events';
import type { PropertyValue } from '../properties';
import { createInstant, createEventId } from '../factories';
import { ok, err as error } from '../result';
import { validateNode } from '../validation';
import { resolveShape } from '../queries';
import { isSystemNodeId } from '../system';

export type NodeOperationOptions = Readonly<{
  deviceId: DeviceId;
  validate?: boolean | undefined;
  batchId?: BatchId | undefined;
  migrationId?: string | undefined;
}>;

/**
Adds a node to the graph.
Returns a new graph with the node added.
Returns Error if a node with the same ID already exists.
*/
export function addNode(
  graph: Graph,
  node: Node,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (graph.nodes.has(node.id)) {
    return error(new Error(`Node with ID ${node.id} already exists`));
  }

  if (node.shape !== undefined) {
    const shapeResult = resolveShape(graph, node.shape);
    if (shapeResult.ok && shapeResult.value.status === 'inactive') {
      return error(
        new Error(
          `Node validation failed: shape: Shape '${node.shape}' is inactive (SHAPE_INACTIVE)`,
        ),
      );
    }
  }

  if (options.validate) {
    const result = validateNode(graph, node);
    if (!result.valid) {
      const msgs = result.errors
        .map((error_) => `${error_.path.join('.')}: ${error_.message}`)
        .join(', ');
      return error(new Error(`Node validation failed: ${msgs}`));
    }
  }

  const newNodes = new Map([...graph.nodes, [node.id, node]]);

  const newGraph = {
    ...graph,
    nodes: newNodes,
    _indexes: undefined,
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
    ...(node.shape !== undefined && { shapeId: node.shape }),
    properties: node.properties,
    timestamp: createInstant(),
    deviceId: options.deviceId,
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  };

  return ok({
    graph: newGraph,
    events: [event],
    value: newGraph,
  });
}

/**
Removes a node from the graph.
Also removes any edges connected to the node.
Returns a new graph.
*/
export function removeNode(
  graph: Graph,
  nodeId: NodeId,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (isSystemNodeId(nodeId)) {
    return error(new Error(`Cannot delete system node: ${nodeId}`));
  }

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
    deviceId: options.deviceId,
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  }));

  const newEdges = new Map(
    [...graph.edges].filter(([_id, edge]) => edge.source !== nodeId && edge.target !== nodeId),
  );

  const newGraph = {
    ...graph,
    nodes: newNodes,
    edges: newEdges,
    _indexes: undefined,
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
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  };

  return ok({
    graph: newGraph,
    events: [nodeEvent, ...edgeEvents],
    value: newGraph,
  });
}

/**
Updates a node in the graph using a functional updater.
Returns a new graph.
Returns Error if the node does not exist.
*/
export function updateNode(
  graph: Graph,
  nodeId: NodeId,
  updater: (node: Node) => Node,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  const existingNode = graph.nodes.get(nodeId);
  if (!existingNode) {
    return error(new Error(`Node with ID ${nodeId} not found`));
  }

  const updatedNode = updater(existingNode);

  // Ensure ID hasn't changed
  if (updatedNode.id !== nodeId) {
    return error(new Error(`Cannot change node ID during update`));
  }

  if (updatedNode.shape !== existingNode.shape) {
    return error(new Error(`Cannot change node shape during update`));
  }

  if (options.validate) {
    const result = validateNode(graph, updatedNode, 'update', existingNode);
    if (!result.valid) {
      const msgs = result.errors
        .map((error_) => `${error_.path.join('.')}: ${error_.message}`)
        .join(', ');
      return error(new Error(`Node validation failed: ${msgs}`));
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
      return [id, id === nodeId ? finalNode : node];
    }),
  );

  const newGraph = {
    ...graph,
    nodes: newNodes,
    _indexes: undefined,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const changes = new Map<string, PropertyValue>(
    [...finalNode.properties].filter(([key, value]) => existingNode.properties.get(key) !== value),
  );

  const event: GraphEvent = {
    type: 'NodePropertiesUpdated',
    eventId: createEventId(),
    id: nodeId,
    changes,
    timestamp: createInstant(),
    deviceId: options.deviceId,
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  };

  return ok({
    graph: newGraph,
    events: [event],
    value: newGraph,
  });
}
