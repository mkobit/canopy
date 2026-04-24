import type {
  Graph,
  Edge,
  EdgeId,
  Result,
  GraphResult,
  GraphEvent,
  DeviceId,
  PropertyValue,
  NodeId,
  TypeId,
  EdgeCreated,
} from '@canopy/types';
import { createInstant, createEventId, ok, err, createEdgeId } from '@canopy/types';
import { validateEdge } from '../validation';

export type EdgeOperationOptions = Readonly<{
  deviceId: DeviceId;
  validate?: boolean;
  batchId?: string;
  migrationId?: string;
}>;

/**
 * Creates an edge between two nodes and returns the resulting graph and EdgeCreated event.
 * Returns Error if source or target nodes do not exist.
 */
export function createEdgeAction(
  graph: Graph,
  params: Readonly<{ source: NodeId; target: NodeId; type: TypeId }>,
): Result<Readonly<{ graph: Graph; event: EdgeCreated }>, Error> {
  const edge: Edge = {
    id: createEdgeId(),
    type: params.type,
    source: params.source,
    target: params.target,
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
 * Adds an edge to the graph.
 * Returns a new graph.
 * Returns Error if source or target nodes do not exist.
 */
export function addEdge(
  graph: Graph,
  edge: Edge,
  options: EdgeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (graph.edges.has(edge.id)) {
    return err(new Error(`Edge with ID ${edge.id} already exists`));
  }
  if (!graph.nodes.has(edge.source)) {
    return err(new Error(`Source node ${edge.source} not found`));
  }
  if (!graph.nodes.has(edge.target)) {
    return err(new Error(`Target node ${edge.target} not found`));
  }

  if (options.validate) {
    const result = validateEdge(graph, edge);
    if (!result.valid) {
      const msgs = result.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return err(new Error(`Edge validation failed: ${msgs}`));
    }
  }

  const newEdges = new Map([...graph.edges, [edge.id, edge]]);

  const newGraph = {
    ...graph,
    edges: newEdges,
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
    edgeType: edge.type,
    source: edge.source,
    target: edge.target,
    properties: edge.properties,
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
 * Removes an edge from the graph.
 * Returns a new graph.
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
 * Updates an edge in the graph using a functional updater.
 * Returns a new graph.
 * Returns Error if the edge does not exist.
 */
export function updateEdge(
  graph: Graph,
  edgeId: EdgeId,
  updater: (edge: Edge) => Edge,
  options: EdgeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  const existingEdge = graph.edges.get(edgeId);
  if (!existingEdge) {
    return err(new Error(`Edge with ID ${edgeId} not found`));
  }

  const updatedEdge = updater(existingEdge);

  // Ensure ID hasn't changed
  if (updatedEdge.id !== edgeId) {
    return err(new Error(`Cannot change edge ID during update`));
  }

  // Verify source/target still exist (in case they were changed, though usually they shouldn't be)
  if (!graph.nodes.has(updatedEdge.source)) {
    return err(new Error(`Source node ${updatedEdge.source} not found`));
  }
  if (!graph.nodes.has(updatedEdge.target)) {
    return err(new Error(`Target node ${updatedEdge.target} not found`));
  }

  if (options.validate) {
    const result = validateEdge(graph, updatedEdge);
    if (!result.valid) {
      const msgs = result.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return err(new Error(`Edge validation failed: ${msgs}`));
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
      if (id === edgeId) {
        return [id, finalEdge];
      }
      return [id, edge];
    }),
  );

  const newGraph = {
    ...graph,
    edges: newEdges,
    metadata: {
      ...graph.metadata,
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const changes = new Map<string, PropertyValue>();
  // eslint-disable-next-line functional/no-loop-statements
  for (const [key, value] of finalEdge.properties) {
    const existing = existingEdge.properties.get(key);
    if (existing !== value) {
      // eslint-disable-next-line functional/immutable-data
      changes.set(key, value);
    }
  }

  const event: GraphEvent = {
    type: 'EdgePropertiesUpdated',
    eventId: createEventId(),
    id: edgeId,
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
