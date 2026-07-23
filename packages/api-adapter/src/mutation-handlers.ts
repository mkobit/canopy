import type { GraphEvent, PropertyValue } from '@canopy/graph';
import {
  createEdgeId,
  createEventId,
  createInstant,
  createNodeId,
  err,
  ok,
} from '@canopy/graph';
import type {
  ApiEdgePayload,
  ApiNodePayload,
  ApiRequest,
  ApiResponse,
  EdgeCreatePayload,
  EdgeDeletePayload,
  MutationResultPayload,
  NodeCreatePayload,
  NodeDeletePayload,
  NodeUpdatePropertiesPayload,
} from './api-payloads';
import { createApiAdapterError } from './result-errors';

// Converts a properties record to a Map for domain events.
const convertPropertiesToMap = (
  props: Readonly<Record<string, PropertyValue>>,
): Map<string, PropertyValue> => new Map(Object.entries(props));

// Creates a new graph node within a session context.
export const executeCreateNode = async (
  request: ApiRequest<NodeCreatePayload>,
): Promise<ApiResponse<ApiNodePayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id, type, properties } = request.payload;
  const nodeId = id ?? createNodeId();

  if (authContext?.tenantId) {
    const payloadTenant = properties.tenantId;
    if (payloadTenant !== undefined && payloadTenant !== authContext.tenantId) {
      return err(
        createApiAdapterError(
          'FORBIDDEN',
          `Cannot create node for tenant '${payloadTenant}' under active tenant '${authContext.tenantId}'`,
        ),
      );
    }
  }

  const finalProperties: Record<string, PropertyValue> = {
    ...properties,
    ...(authContext?.tenantId ? { tenantId: authContext.tenantId } : {}),
  };

  const currentGraph = session.graph();
  if (currentGraph.nodes.has(nodeId)) {
    return err(
      createApiAdapterError('CONCURRENCY_CONFLICT', `Node with ID ${nodeId} already exists`),
    );
  }

  const eventId = createEventId();
  const now = createInstant();

  const event: GraphEvent = {
    type: 'NodeCreated',
    eventId,
    id: nodeId,
    nodeType: type,
    properties: convertPropertiesToMap(finalProperties),
    timestamp: now,
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  const updatedGraph = session.graph();
  const createdNode = updatedGraph.nodes.get(nodeId);
  if (!createdNode) {
    return err(createApiAdapterError('INTERNAL_ERROR', 'Node was not found post-commit'));
  }

  return ok({
    id: createdNode.id,
    type: createdNode.type,
    properties: Object.fromEntries(createdNode.properties.entries()),
    createdAt: createdNode.metadata.created,
    updatedAt: createdNode.metadata.modified,
  });
};

// Updates properties on an existing graph node within a session context.
export const executeUpdateNodeProperties = async (
  request: ApiRequest<NodeUpdatePropertiesPayload>,
): Promise<ApiResponse<ApiNodePayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id, properties } = request.payload;
  const currentGraph = session.graph();
  const existingNode = currentGraph.nodes.get(id);

  if (!existingNode) {
    return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
  }

  if (authContext?.tenantId) {
    const existingTenant = existingNode.properties.get('tenantId');
    if (existingTenant !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
    }
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
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  const updatedGraph = session.graph();
  const updatedNode = updatedGraph.nodes.get(id);
  if (!updatedNode) {
    return err(createApiAdapterError('INTERNAL_ERROR', 'Node was not found post-commit'));
  }

  return ok({
    id: updatedNode.id,
    type: updatedNode.type,
    properties: Object.fromEntries(updatedNode.properties.entries()),
    createdAt: updatedNode.metadata.created,
    updatedAt: updatedNode.metadata.modified,
  });
};

// Deletes a node and all connected edges from the graph session context.
export const executeDeleteNode = async (
  request: ApiRequest<NodeDeletePayload>,
): Promise<ApiResponse<MutationResultPayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id } = request.payload;
  const currentGraph = session.graph();
  const existingNode = currentGraph.nodes.get(id);

  if (!existingNode) {
    return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
  }

  if (authContext?.tenantId) {
    const existingTenant = existingNode.properties.get('tenantId');
    if (existingTenant !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Node with ID ${id} not found`));
    }
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
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  return ok({
    id,
    success: true,
    affectedEventsCount: events.length,
  });
};

// Creates a new edge connecting source and target nodes within a session context.
export const executeCreateEdge = async (
  request: ApiRequest<EdgeCreatePayload>,
): Promise<ApiResponse<ApiEdgePayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id, type, source, target, properties = {} } = request.payload;
  const edgeId = id ?? createEdgeId();
  const currentGraph = session.graph();

  const sourceNode = currentGraph.nodes.get(source);
  const targetNode = currentGraph.nodes.get(target);

  if (!sourceNode) {
    return err(createApiAdapterError('NOT_FOUND', `Source node with ID ${source} not found`));
  }
  if (!targetNode) {
    return err(createApiAdapterError('NOT_FOUND', `Target node with ID ${target} not found`));
  }

  if (authContext?.tenantId) {
    if (sourceNode.properties.get('tenantId') !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Source node with ID ${source} not found`));
    }
    if (targetNode.properties.get('tenantId') !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Target node with ID ${target} not found`));
    }
  }

  if (currentGraph.edges.has(edgeId)) {
    return err(
      createApiAdapterError('CONCURRENCY_CONFLICT', `Edge with ID ${edgeId} already exists`),
    );
  }

  const event: GraphEvent = {
    type: 'EdgeCreated',
    eventId: createEventId(),
    id: edgeId,
    edgeType: type,
    source,
    target,
    properties: convertPropertiesToMap(properties),
    timestamp: createInstant(),
    deviceId: currentGraph.metadata.modifiedBy,
  };

  const commitResult = await session.commit([event]);
  if (!commitResult.ok) {
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  const updatedGraph = session.graph();
  const createdEdge = updatedGraph.edges.get(edgeId);
  if (!createdEdge) {
    return err(createApiAdapterError('INTERNAL_ERROR', 'Edge was not found post-commit'));
  }

  return ok({
    id: createdEdge.id,
    type: createdEdge.type,
    source: createdEdge.source,
    target: createdEdge.target,
    properties: Object.fromEntries(createdEdge.properties.entries()),
  });
};

// Deletes an edge from the graph session context.
export const executeDeleteEdge = async (
  request: ApiRequest<EdgeDeletePayload>,
): Promise<ApiResponse<MutationResultPayload>> => {
  const { session, authContext } = request.context;
  if (!session) {
    return err(
      createApiAdapterError(
        'VALIDATION_ERROR',
        'GraphSession is required in ApiAdapterContext for write mutations',
      ),
    );
  }

  const { id } = request.payload;
  const currentGraph = session.graph();
  const existingEdge = currentGraph.edges.get(id);

  if (!existingEdge) {
    return err(createApiAdapterError('NOT_FOUND', `Edge with ID ${id} not found`));
  }

  if (authContext?.tenantId) {
    const sourceNode = currentGraph.nodes.get(existingEdge.source);
    if (!sourceNode || sourceNode.properties.get('tenantId') !== authContext.tenantId) {
      return err(createApiAdapterError('NOT_FOUND', `Edge with ID ${id} not found`));
    }
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
    return err(createApiAdapterError('VALIDATION_ERROR', commitResult.error.message));
  }

  return ok({
    id,
    success: true,
    affectedEventsCount: 1,
  });
};
