import type { CommitError, GraphEvent, PropertyValue } from '@canopy/graph';
import { createEdgeId, createEventId, createInstant, createNodeId, err, ok } from '@canopy/graph';
import type { GraphAccessErrorCategory } from './result-errors';
import type {
  GraphAccessEdgePayload,
  GraphAccessNodePayload,
  GraphAccessRequest,
  GraphAccessResponse,
  EdgeCreatePayload,
  EdgeDeletePayload,
  MutationResultPayload,
  NodeCreatePayload,
  NodeDeletePayload,
  NodeUpdatePropertiesPayload,
} from './graph-access-payloads';
import { createGraphAccessError } from './result-errors';
import { createGraphAccessRequest } from './graph-access-payloads';
import type { GraphAccessContext } from './graph-access-context';

// Converts a properties record to a ReadonlyMap for domain events.
const convertPropertiesToMap = (
  properties: Readonly<Record<string, PropertyValue>>,
): ReadonlyMap<string, PropertyValue> => new Map(Object.entries(properties));

const mapCommitErrorToCategory = (commitError: CommitError): GraphAccessErrorCategory => {
  switch (commitError.kind) {
    case 'validation':
    case 'batch':
    case 'projection': {
      return 'VALIDATION_ERROR';
    }
    case 'system-node': {
      return 'FORBIDDEN';
    }
    case 'storage': {
      return 'INTERNAL_ERROR';
    }
  }
};

// Creates a new graph node within a session context.
export const executeCreateNode = async (
  request: GraphAccessRequest<NodeCreatePayload>,
): Promise<GraphAccessResponse<GraphAccessNodePayload>> => {
  const { session } = request.context;
  if (!session) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'GraphSession is required in GraphAccessContext for write mutations',
      ),
    );
  }

  const { id, shapeId: explicitShapeId, type, properties } = request.payload;
  const shapeId = explicitShapeId ?? type;
  const nodeId = id ?? createNodeId();

  const currentGraph = session.graph();
  if (currentGraph.nodes.has(nodeId)) {
    return err(
      createGraphAccessError('CONCURRENCY_CONFLICT', `Node with ID ${nodeId} already exists`),
    );
  }

  const eventId = createEventId();
  const now = createInstant();

  const event: GraphEvent = {
    type: 'NodeCreated',
    eventId,
    id: nodeId,
    ...(shapeId !== undefined && { shapeId }),
    properties: convertPropertiesToMap(properties),
    timestamp: now,
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(
      createGraphAccessError(
        mapCommitErrorToCategory(commitResult.error),
        commitResult.error.message,
      ),
    );
  }

  const updatedGraph = session.graph();
  const createdNode = updatedGraph.nodes.get(nodeId);
  if (!createdNode) {
    return err(createGraphAccessError('INTERNAL_ERROR', 'Node was not found post-commit'));
  }

  return ok({
    id: createdNode.id,
    ...(createdNode.shape !== undefined && { type: createdNode.shape }),
    properties: Object.fromEntries(createdNode.properties),
    createdAt: createdNode.metadata.created,
    updatedAt: createdNode.metadata.modified,
  });
};

// Updates properties on an existing graph node within a session context.
export const executeUpdateNodeProperties = async (
  request: GraphAccessRequest<NodeUpdatePropertiesPayload>,
): Promise<GraphAccessResponse<GraphAccessNodePayload>> => {
  const { session } = request.context;
  if (!session) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'GraphSession is required in GraphAccessContext for write mutations',
      ),
    );
  }

  const { id, properties } = request.payload;
  const currentGraph = session.graph();
  const existingNode = currentGraph.nodes.get(id);

  if (!existingNode) {
    return err(createGraphAccessError('NOT_FOUND', `Node with ID ${id} not found`));
  }

  const changesMap = convertPropertiesToMap(properties);
  const event: GraphEvent = {
    type: 'NodePropertiesUpdated',
    eventId: createEventId(),
    id,
    changes: changesMap,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(
      createGraphAccessError(
        mapCommitErrorToCategory(commitResult.error),
        commitResult.error.message,
      ),
    );
  }

  const updatedGraph = session.graph();
  const updatedNode = updatedGraph.nodes.get(id);
  if (!updatedNode) {
    return err(createGraphAccessError('INTERNAL_ERROR', 'Node was not found post-commit'));
  }

  return ok({
    id: updatedNode.id,
    ...(updatedNode.shape !== undefined && { type: updatedNode.shape }),
    properties: Object.fromEntries(updatedNode.properties),
    createdAt: updatedNode.metadata.created,
    updatedAt: updatedNode.metadata.modified,
  });
};

// Deletes a node and all connected edges from the graph session context.
export const executeDeleteNode = async (
  request: GraphAccessRequest<NodeDeletePayload>,
): Promise<GraphAccessResponse<MutationResultPayload>> => {
  const { session } = request.context;
  if (!session) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'GraphSession is required in GraphAccessContext for write mutations',
      ),
    );
  }

  const { id } = request.payload;
  const currentGraph = session.graph();
  const existingNode = currentGraph.nodes.get(id);

  if (!existingNode) {
    return err(createGraphAccessError('NOT_FOUND', `Node with ID ${id} not found`));
  }

  const edgesToDelete = [...currentGraph.edges.values()].filter(
    (edge) => edge.source === id || edge.target === id,
  );

  const edgeEvents: readonly GraphEvent[] = edgesToDelete.map((edge) => ({
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id: edge.id,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  }));

  const nodeEvent: GraphEvent = {
    type: 'NodeDeleted',
    eventId: createEventId(),
    id,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const events: readonly GraphEvent[] = [nodeEvent, ...edgeEvents];
  const commitResult = await session.commit(events);
  if (!commitResult.ok) {
    return err(
      createGraphAccessError(
        mapCommitErrorToCategory(commitResult.error),
        commitResult.error.message,
      ),
    );
  }

  return ok({
    id,
    success: true,
    affectedEventsCount: events.length,
  });
};

// Creates a new edge connecting source and target nodes within a session context.
export const executeCreateEdge = async (
  request: GraphAccessRequest<EdgeCreatePayload>,
): Promise<GraphAccessResponse<GraphAccessEdgePayload>> => {
  const { session } = request.context;
  if (!session) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'GraphSession is required in GraphAccessContext for write mutations',
      ),
    );
  }

  const { id, shapeId: explicitShapeId, type, source, target, properties = {} } = request.payload;
  const shapeId = explicitShapeId ?? type;
  const edgeId = id ?? createEdgeId();
  const currentGraph = session.graph();

  const sourceNode = currentGraph.nodes.get(source);
  const targetNode = currentGraph.nodes.get(target);

  if (!sourceNode) {
    return err(createGraphAccessError('NOT_FOUND', `Source node with ID ${source} not found`));
  }
  if (!targetNode) {
    return err(createGraphAccessError('NOT_FOUND', `Target node with ID ${target} not found`));
  }

  if (currentGraph.edges.has(edgeId)) {
    return err(
      createGraphAccessError('CONCURRENCY_CONFLICT', `Edge with ID ${edgeId} already exists`),
    );
  }

  const event: GraphEvent = {
    type: 'EdgeCreated',
    eventId: createEventId(),
    id: edgeId,
    ...(shapeId !== undefined && { shapeId }),
    source,
    target,
    properties: convertPropertiesToMap(properties),
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(
      createGraphAccessError(
        mapCommitErrorToCategory(commitResult.error),
        commitResult.error.message,
      ),
    );
  }

  const updatedGraph = session.graph();
  const createdEdge = updatedGraph.edges.get(edgeId);
  if (!createdEdge) {
    return err(createGraphAccessError('INTERNAL_ERROR', 'Edge was not found post-commit'));
  }

  return ok({
    id: createdEdge.id,
    ...(createdEdge.shape !== undefined && { type: createdEdge.shape }),
    source: createdEdge.source,
    target: createdEdge.target,
    properties: Object.fromEntries(createdEdge.properties),
  });
};

// Deletes an edge from the graph session context.
export const executeDeleteEdge = async (
  request: GraphAccessRequest<EdgeDeletePayload>,
): Promise<GraphAccessResponse<MutationResultPayload>> => {
  const { session } = request.context;
  if (!session) {
    return err(
      createGraphAccessError(
        'VALIDATION_ERROR',
        'GraphSession is required in GraphAccessContext for write mutations',
      ),
    );
  }

  const { id } = request.payload;
  const currentGraph = session.graph();
  const existingEdge = currentGraph.edges.get(id);

  if (!existingEdge) {
    return err(createGraphAccessError('NOT_FOUND', `Edge with ID ${id} not found`));
  }

  const event: GraphEvent = {
    type: 'EdgeDeleted',
    eventId: createEventId(),
    id,
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(
      createGraphAccessError(
        mapCommitErrorToCategory(commitResult.error),
        commitResult.error.message,
      ),
    );
  }

  return ok({
    id,
    success: true,
    affectedEventsCount: 1,
  });
};

export const executeMutation = {
  createNode: async (
    context: GraphAccessContext,
    payload: NodeCreatePayload,
  ): Promise<GraphAccessResponse<MutationResultPayload>> => {
    const result = await executeCreateNode(
      createGraphAccessRequest('gql-create-node', context, payload),
    );
    return result.ok ? ok({ id: result.value.id, success: true, affectedEventsCount: 1 }) : result;
  },

  updateNodeProperties: async (
    context: GraphAccessContext,
    payload: NodeUpdatePropertiesPayload,
  ): Promise<GraphAccessResponse<MutationResultPayload>> => {
    const result = await executeUpdateNodeProperties(
      createGraphAccessRequest('gql-update-node-props', context, payload),
    );
    return result.ok ? ok({ id: result.value.id, success: true, affectedEventsCount: 1 }) : result;
  },

  deleteNode: async (
    context: GraphAccessContext,
    payload: NodeDeletePayload,
  ): Promise<GraphAccessResponse<MutationResultPayload>> => {
    return executeDeleteNode(createGraphAccessRequest('gql-delete-node', context, payload));
  },

  createEdge: async (
    context: GraphAccessContext,
    payload: EdgeCreatePayload,
  ): Promise<GraphAccessResponse<MutationResultPayload>> => {
    const result = await executeCreateEdge(
      createGraphAccessRequest('gql-create-edge', context, payload),
    );
    return result.ok ? ok({ id: result.value.id, success: true, affectedEventsCount: 1 }) : result;
  },

  deleteEdge: async (
    context: GraphAccessContext,
    payload: EdgeDeletePayload,
  ): Promise<GraphAccessResponse<MutationResultPayload>> => {
    return executeDeleteEdge(createGraphAccessRequest('gql-delete-edge', context, payload));
  },
};
