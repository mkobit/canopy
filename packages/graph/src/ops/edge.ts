import type { Graph } from '../graph';
import type { Edge } from '../edge';
import type { EdgeId, DeviceId, NodeId, ShapeId, BatchId } from '../identifiers';
import type { Result } from '../result';
import type { GraphEvent, GraphResult, EdgeCreated } from '../events';
import type { PropertyValue } from '../properties';
import { createInstant, createEventId, createEdgeId } from '../factories';
import { ok, err as error } from '../result';
import { validateEdge } from '../validation';

export type EdgeOperationOptions = Readonly<{
  deviceId: DeviceId;
  validate?: boolean | undefined;
  batchId?: BatchId | undefined;
  migrationId?: string | undefined;
}>;

/**
Creates an edge between two nodes and returns the resulting graph and EdgeCreated event.
Returns Error if source or target nodes do not exist.
*/
export function createEdgeAction(
  graph: Graph,
  parameters: Readonly<{
    source: NodeId;
    target: NodeId;
    shape?: ShapeId | undefined;
    /**
    @deprecated Use shape
    */
    type?: ShapeId | undefined;
  }>,
): Result<Readonly<{ graph: Graph; event: EdgeCreated }>, Error> {
  const effectiveShape = parameters.shape ?? parameters.type;
  const edge: Edge = {
    id: createEdgeId(),
    ...(effectiveShape !== undefined && { shape: effectiveShape }),
    source: parameters.source,
    target: parameters.target,
    properties: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: graph.metadata.modifiedBy,
    },
  };

  const addResult = addEdge(graph, edge, {
    deviceId: graph.metadata.modifiedBy,
  });

  if (!addResult.ok) {
    return addResult;
  }

  const newGraph = addResult.value.graph;
  const event = addResult.value.events[0] as EdgeCreated;

  return ok({
    graph: newGraph,
    event,
  });
}

/**
Adds an edge to the graph.
Returns a new graph.
Returns Error if source or target nodes do not exist.
*/
export function addEdge(
  graph: Graph,
  edge: Edge,
  options: EdgeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (graph.edges.has(edge.id)) {
    return error(new Error(`Edge with ID ${edge.id} already exists`));
  }
  if (!graph.nodes.has(edge.source)) {
    return error(new Error(`Source node ${edge.source} not found`));
  }
  if (!graph.nodes.has(edge.target)) {
    return error(new Error(`Target node ${edge.target} not found`));
  }

  if (options.validate) {
    const result = validateEdge(graph, edge);
    if (!result.valid) {
      const msgs = result.errors
        .map((error_) => `${error_.path.join('.')}: ${error_.message}`)
        .join(', ');
      return error(new Error(`Edge validation failed: ${msgs}`));
    }
  }

  const newEdges = new Map([...graph.edges, [edge.id, edge]]);

  const newGraph = {
    ...graph,
    edges: newEdges,
    _indexes: undefined,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const event: GraphEvent = {
    type: 'EdgeCreated',
    eventId: createEventId(),
    id: edge.id,
    ...(edge.shape !== undefined && { shapeId: edge.shape }),
    source: edge.source,
    target: edge.target,
    properties: edge.properties,
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
Removes an edge from the graph.
Returns a new graph.
*/
export function removeEdge(
  graph: Graph,
  edgeId: EdgeId,
  options: EdgeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (!graph.edges.has(edgeId)) {
    return ok({
      graph,
      events: [],
      value: graph,
    });
  }

  const newEdges = new Map([...graph.edges].filter(([id]) => id !== edgeId));

  const newGraph = {
    ...graph,
    edges: newEdges,
    _indexes: undefined,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const event: GraphEvent = {
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id: edgeId,
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
Updates an edge in the graph using a functional updater.
Returns a new graph.
Returns Error if the edge does not exist.
*/
export function updateEdge(
  graph: Graph,
  edgeId: EdgeId,
  updater: (edge: Edge) => Edge,
  options: EdgeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  const existingEdge = graph.edges.get(edgeId);
  if (!existingEdge) {
    return error(new Error(`Edge with ID ${edgeId} not found`));
  }

  const updatedEdge = updater(existingEdge);

  // Ensure ID hasn't changed
  if (updatedEdge.id !== edgeId) {
    return error(new Error(`Cannot change edge ID during update`));
  }

  if (updatedEdge.shape !== existingEdge.shape) {
    return error(new Error(`Cannot change edge shape during update`));
  }

  // Verify source/target still exist (in case they were changed, though usually they shouldn't be)
  if (!graph.nodes.has(updatedEdge.source)) {
    return error(new Error(`Source node ${updatedEdge.source} not found`));
  }
  if (!graph.nodes.has(updatedEdge.target)) {
    return error(new Error(`Target node ${updatedEdge.target} not found`));
  }

  if (options.validate) {
    const result = validateEdge(graph, updatedEdge);
    if (!result.valid) {
      const msgs = result.errors
        .map((error_) => `${error_.path.join('.')}: ${error_.message}`)
        .join(', ');
      return error(new Error(`Edge validation failed: ${msgs}`));
    }
  }

  const finalEdge = {
    ...updatedEdge,
    metadata: {
      ...updatedEdge.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const newEdges = new Map(
    [...graph.edges].map(([id, edge]) => {
      return [id, id === edgeId ? finalEdge : edge];
    }),
  );

  const newGraph = {
    ...graph,
    edges: newEdges,
    _indexes: undefined,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const changes = new Map<string, PropertyValue>(
    [...finalEdge.properties].filter(([key, value]) => existingEdge.properties.get(key) !== value),
  );

  const event: GraphEvent = {
    type: 'EdgePropertiesUpdated',
    eventId: createEventId(),
    id: edgeId,
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
