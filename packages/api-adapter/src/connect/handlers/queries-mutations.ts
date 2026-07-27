import type { PropertyValue } from '@canopy/graph';
import { asEdgeId, asNodeId, asTypeId, createInstant } from '@canopy/graph';
import type { ApiAdapterContext } from '../../api-context';
import { createApiRequest } from '../../api-payloads';
import {
  executeCreateEdge,
  executeCreateNode,
  executeDeleteEdge,
  executeDeleteNode,
  executeUpdateNodeProperties,
} from '../../mutation-handlers';
import { executeNodeQuery, executeQuery } from '../../query-handlers';
import { createConnectErrorPayload } from '../grpc-errors';

export type ConnectNodeResponse = Readonly<{
  success: boolean;
  id?: string;
  type_id?: string;
  properties_json?: string;
  created_at?: string;
  updated_at?: string;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectNodeListResponse = Readonly<{
  success: boolean;
  nodes: readonly ConnectNodeResponse[];
  error_code?: string;
  error_message?: string;
}>;

export type ConnectEdgeResponse = Readonly<{
  success: boolean;
  id?: string;
  source_node_id?: string;
  target_node_id?: string;
  predicate_type_id?: string;
  properties_json?: string;
  error_code?: string;
  error_message?: string;
}>;

export type ConnectEdgeListResponse = Readonly<{
  success: boolean;
  edges: readonly ConnectEdgeResponse[];
  error_code?: string;
  error_message?: string;
}>;

export type ConnectTraversalStepResponse = Readonly<{
  node_id: string;
  depth: number;
  matched_via_edge_id?: string | undefined;
}>;

export type ConnectTraversalResponse = Readonly<{
  success: boolean;
  steps: readonly ConnectTraversalStepResponse[];
  error_code?: string;
  error_message?: string;
}>;

export type ConnectMutationResultResponse = Readonly<{
  success: boolean;
  entity_id?: string;
  sequence_number?: number;
  committed_at?: string;
  error_code?: string;
  error_message?: string;
}>;

const parseJsonPropertyValue = (valueJson: string): PropertyValue => {
  // eslint-disable-next-line functional/no-try-statements -- JSON parse fallback for property value
  try {
    return JSON.parse(valueJson) as PropertyValue;
  } catch {
    return valueJson as PropertyValue;
  }
};

const handleGetNodeById = async (
  context: ApiAdapterContext,
  request: Readonly<{ id: string }>,
): Promise<ConnectNodeResponse> => {
  const res = executeQuery.getNode(context, asNodeId(request.id));
  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, error_code: error.errorCode, error_message: error.message };
  }
  return {
    success: true,
    id: res.value.id,
    type_id: res.value.type,
    properties_json: JSON.stringify(res.value.properties),
    created_at: res.value.createdAt,
    updated_at: res.value.updatedAt,
  };
};

const handleGetNodesByType = async (
  context: ApiAdapterContext,
  request: Readonly<{ type_id: string }>,
): Promise<ConnectNodeListResponse> => {
  const res = executeQuery.getNodes(context, { type: asTypeId(request.type_id) });
  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, nodes: [], error_code: error.errorCode, error_message: error.message };
  }
  return {
    success: true,
    nodes: res.value.map((n) => ({
      success: true,
      id: n.id,
      type_id: n.type,
      properties_json: JSON.stringify(n.properties),
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    })),
  };
};

const handleGetNodesByProperty = async (
  context: ApiAdapterContext,
  request: Readonly<{ key: string; value_json: string }>,
): Promise<ConnectNodeListResponse> => {
  const parsedValue = parseJsonPropertyValue(request.value_json);
  const res = executeNodeQuery(
    createApiRequest('connect-get-nodes-by-property', context, {
      filter: { property: request.key, operator: 'eq', value: parsedValue },
    }),
  );
  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, nodes: [], error_code: error.errorCode, error_message: error.message };
  }
  return {
    success: true,
    nodes: res.value.map((n) => ({
      success: true,
      id: n.id,
      type_id: n.type,
      properties_json: JSON.stringify(n.properties),
      created_at: n.createdAt,
      updated_at: n.updatedAt,
    })),
  };
};

const handleGetInboundEdges = async (
  context: ApiAdapterContext,
  request: Readonly<{ target_node_id: string; predicate_type_id?: string }>,
): Promise<ConnectEdgeListResponse> => {
  const res = executeQuery.getEdges(context, {
    target: asNodeId(request.target_node_id),
    type: request.predicate_type_id ? asTypeId(request.predicate_type_id) : undefined,
  });
  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, edges: [], error_code: error.errorCode, error_message: error.message };
  }
  return {
    success: true,
    edges: res.value.map((e) => ({
      success: true,
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      predicate_type_id: e.type,
      properties_json: JSON.stringify(e.properties),
    })),
  };
};

const handleGetOutboundEdges = async (
  context: ApiAdapterContext,
  request: Readonly<{ source_node_id: string; predicate_type_id?: string }>,
): Promise<ConnectEdgeListResponse> => {
  const res = executeQuery.getEdges(context, {
    source: asNodeId(request.source_node_id),
    type: request.predicate_type_id ? asTypeId(request.predicate_type_id) : undefined,
  });
  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, edges: [], error_code: error.errorCode, error_message: error.message };
  }
  return {
    success: true,
    edges: res.value.map((e) => ({
      success: true,
      id: e.id,
      source_node_id: e.source,
      target_node_id: e.target,
      predicate_type_id: e.type,
      properties_json: JSON.stringify(e.properties),
    })),
  };
};

const handleExecuteTraversalQuery = async (
  context: ApiAdapterContext,
  request: Readonly<{
    start_node_id: string;
    max_depth?: number;
    filter_predicate_type_ids?: readonly string[];
  }>,
): Promise<ConnectTraversalResponse> => {
  const edgeType =
    request.filter_predicate_type_ids && request.filter_predicate_type_ids.length > 0
      ? asTypeId(request.filter_predicate_type_ids[0] ?? '')
      : undefined;
  const res = executeQuery.traverse(context, {
    startNodeIds: [asNodeId(request.start_node_id)],
    edgeType,
    maxDepth: request.max_depth,
  });
  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, steps: [], error_code: error.errorCode, error_message: error.message };
  }

  const { nodes, edges } = res.value;
  const startId = request.start_node_id;

  const buildStepMaps = (
    q: readonly string[],
    visitedDepths: ReadonlyMap<string, number>,
    visitedEdges: ReadonlyMap<string, string>,
  ): Readonly<{
    depths: ReadonlyMap<string, number>;
    edgeMap: ReadonlyMap<string, string>;
  }> => {
    if (q.length === 0) {
      return { depths: visitedDepths, edgeMap: visitedEdges };
    }

    const [current, ...rest] = q;
    if (current === undefined) {
      return { depths: visitedDepths, edgeMap: visitedEdges };
    }

    const currentDepth = visitedDepths.get(current) ?? 0;
    const matchingEdges = edges.filter(
      (edge) => edge.source === current && !visitedDepths.has(edge.target),
    );

    const newDepths = new Map(visitedDepths);
    const newEdgeMap = new Map(visitedEdges);
    const nextQueue: readonly string[] = matchingEdges
      .filter((edge) => !newDepths.has(edge.target))
      .map((edge) => {
        // eslint-disable-next-line functional/immutable-data -- local Map accumulator
        newDepths.set(edge.target, currentDepth + 1);
        // eslint-disable-next-line functional/immutable-data -- local Map accumulator
        newEdgeMap.set(edge.target, edge.id);
        return edge.target;
      });

    return buildStepMaps([...rest, ...nextQueue], newDepths, newEdgeMap);
  };

  const stepMaps = Object.freeze(buildStepMaps([startId], new Map([[startId, 0]]), new Map()));

  const steps: readonly ConnectTraversalStepResponse[] = nodes.map((node) => ({
    node_id: node.id,
    depth: stepMaps.depths.get(node.id) ?? 0,
    matched_via_edge_id: stepMaps.edgeMap.get(node.id),
  }));

  return {
    success: true,
    steps,
  };
};

export const createConnectQueryHandlers = (context: ApiAdapterContext) => ({
  getNodeById: (request: Readonly<{ id: string }>) => handleGetNodeById(context, request),
  getNodesByType: (request: Readonly<{ type_id: string }>) =>
    handleGetNodesByType(context, request),
  getNodesByProperty: (request: Readonly<{ key: string; value_json: string }>) =>
    handleGetNodesByProperty(context, request),
  getInboundEdges: (request: Readonly<{ target_node_id: string; predicate_type_id?: string }>) =>
    handleGetInboundEdges(context, request),
  getOutboundEdges: (request: Readonly<{ source_node_id: string; predicate_type_id?: string }>) =>
    handleGetOutboundEdges(context, request),
  executeTraversalQuery: (
    request: Readonly<{
      start_node_id: string;
      max_depth?: number;
      filter_predicate_type_ids?: readonly string[];
    }>,
  ) => handleExecuteTraversalQuery(context, request),
});

const handleCreateNode = async (
  context: ApiAdapterContext,
  request: Readonly<{
    type_id: string;
    properties_json?: string;
    expected_sequence?: string;
  }>,
): Promise<ConnectMutationResultResponse> => {
  const properties: Readonly<Record<string, PropertyValue>> = Object.freeze(
    request.properties_json
      ? (JSON.parse(request.properties_json) as Record<string, PropertyValue>)
      : {},
  );
  const expectedSequence = request.expected_sequence
    ? Number(request.expected_sequence)
    : undefined;
  const sequenceOption =
    expectedSequence === undefined ? {} : { expectedSequence: expectedSequence };

  const res = await executeCreateNode(
    createApiRequest('connect-create-node', context, {
      type: asTypeId(request.type_id),
      properties,
      ...sequenceOption,
    }),
  );

  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, error_code: error.errorCode, error_message: error.message };
  }

  return {
    success: true,
    entity_id: res.value.id,
    sequence_number: expectedSequence ?? 1,
    committed_at: res.value.createdAt,
  };
};

const handleUpdateNodeProperties = async (
  context: ApiAdapterContext,
  request: Readonly<{
    id: string;
    properties_json: string;
    expected_sequence?: string;
  }>,
): Promise<ConnectMutationResultResponse> => {
  const properties: Readonly<Record<string, PropertyValue>> = Object.freeze(
    JSON.parse(request.properties_json) as Record<string, PropertyValue>,
  );
  const expectedSequence = request.expected_sequence
    ? Number(request.expected_sequence)
    : undefined;
  const sequenceOption =
    expectedSequence === undefined ? {} : { expectedSequence: expectedSequence };

  const res = await executeUpdateNodeProperties(
    createApiRequest('connect-update-node-props', context, {
      id: asNodeId(request.id),
      properties,
      ...sequenceOption,
    }),
  );

  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, error_code: error.errorCode, error_message: error.message };
  }

  return {
    success: true,
    entity_id: res.value.id,
    sequence_number: expectedSequence ?? 1,
    committed_at: res.value.updatedAt,
  };
};

const handleDeleteNode = async (
  context: ApiAdapterContext,
  request: Readonly<{
    id: string;
    expected_sequence?: string;
  }>,
): Promise<ConnectMutationResultResponse> => {
  const expectedSequence = request.expected_sequence
    ? Number(request.expected_sequence)
    : undefined;
  const sequenceOption =
    expectedSequence === undefined ? {} : { expectedSequence: expectedSequence };

  const res = await executeDeleteNode(
    createApiRequest('connect-delete-node', context, {
      id: asNodeId(request.id),
      ...sequenceOption,
    }),
  );

  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, error_code: error.errorCode, error_message: error.message };
  }

  return {
    success: true,
    entity_id: res.value.id,
    sequence_number: expectedSequence ?? 1,
    committed_at: createInstant(),
  };
};

const handleCreateEdge = async (
  context: ApiAdapterContext,
  request: Readonly<{
    source_node_id: string;
    target_node_id: string;
    predicate_type_id: string;
    properties_json?: string;
    expected_sequence?: string;
  }>,
): Promise<ConnectMutationResultResponse> => {
  const properties: Readonly<Record<string, PropertyValue>> = Object.freeze(
    request.properties_json
      ? (JSON.parse(request.properties_json) as Record<string, PropertyValue>)
      : {},
  );
  const expectedSequence = request.expected_sequence
    ? Number(request.expected_sequence)
    : undefined;
  const sequenceOption =
    expectedSequence === undefined ? {} : { expectedSequence: expectedSequence };

  const res = await executeCreateEdge(
    createApiRequest('connect-create-edge', context, {
      source: asNodeId(request.source_node_id),
      target: asNodeId(request.target_node_id),
      type: asTypeId(request.predicate_type_id),
      properties,
      ...sequenceOption,
    }),
  );

  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, error_code: error.errorCode, error_message: error.message };
  }

  return {
    success: true,
    entity_id: res.value.id,
    sequence_number: expectedSequence ?? 1,
    committed_at: createInstant(),
  };
};

const handleDeleteEdge = async (
  context: ApiAdapterContext,
  request: Readonly<{
    id: string;
    expected_sequence?: string;
  }>,
): Promise<ConnectMutationResultResponse> => {
  const expectedSequence = request.expected_sequence
    ? Number(request.expected_sequence)
    : undefined;
  const sequenceOption =
    expectedSequence === undefined ? {} : { expectedSequence: expectedSequence };

  const res = await executeDeleteEdge(
    createApiRequest('connect-delete-edge', context, {
      id: asEdgeId(request.id),
      ...sequenceOption,
    }),
  );

  if (!res.ok) {
    const error = createConnectErrorPayload(res.error);
    return { success: false, error_code: error.errorCode, error_message: error.message };
  }

  return {
    success: true,
    entity_id: res.value.id,
    sequence_number: expectedSequence ?? 1,
    committed_at: createInstant(),
  };
};

export const createConnectMutationHandlers = (context: ApiAdapterContext) => ({
  createNode: (
    request: Readonly<{
      type_id: string;
      properties_json?: string;
      expected_sequence?: string;
    }>,
  ) => handleCreateNode(context, request),
  updateNodeProperties: (
    request: Readonly<{
      id: string;
      properties_json: string;
      expected_sequence?: string;
    }>,
  ) => handleUpdateNodeProperties(context, request),
  deleteNode: (
    request: Readonly<{
      id: string;
      expected_sequence?: string;
    }>,
  ) => handleDeleteNode(context, request),
  createEdge: (
    request: Readonly<{
      source_node_id: string;
      target_node_id: string;
      predicate_type_id: string;
      properties_json?: string;
      expected_sequence?: string;
    }>,
  ) => handleCreateEdge(context, request),
  deleteEdge: (
    request: Readonly<{
      id: string;
      expected_sequence?: string;
    }>,
  ) => handleDeleteEdge(context, request),
});
