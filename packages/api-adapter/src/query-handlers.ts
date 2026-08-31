import type { Edge, Node, NodeId, TypeId } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type { QueryStep } from '@canopy/queries';
import { executeQuery as executeQueryEngine } from '@canopy/queries';
import type {
  ApiEdgePayload,
  ApiNodePayload,
  ApiRequest,
  ApiResponse,
  ApiTraversalPayload,
  EdgeQueryPayload,
  NodeQueryPayload,
  PropertyLookupPayload,
  PropertyLookupResult,
  TraversalQueryPayload,
} from './api-payloads';
import { createApiRequest } from './api-payloads';
import type { ApiAdapterContext } from './api-context';
import { createApiAdapterError } from './result-errors';

// Maps a graph node to API payload format.
const mapNodeToPayload = (node: Node): ApiNodePayload => ({
  id: node.id,
  type: node.type,
  properties: Object.fromEntries(node.properties),
  createdAt: node.metadata.created,
  updatedAt: node.metadata.modified,
});

// Maps a graph edge to API payload format.
const mapEdgeToPayload = (edge: Edge): ApiEdgePayload => ({
  id: edge.id,
  type: edge.type,
  source: edge.source,
  target: edge.target,
  properties: Object.fromEntries(edge.properties),
});

// Resolves target node ID along an edge based on traversal direction.
const resolveNextNodeId = (
  edge: Edge,
  currentId: string,
  direction: 'in' | 'out' | 'both',
  edgeType?: TypeId,
): string | undefined => {
  if (edgeType && edge.type !== edgeType) return undefined;
  if ((direction === 'out' || direction === 'both') && edge.source === currentId) {
    return edge.target;
  }
  if ((direction === 'in' || direction === 'both') && edge.target === currentId) {
    return edge.source;
  }
  return undefined;
};

// Executes a node query against the graph context.
export const executeNodeQuery = (
  request: ApiRequest<NodeQueryPayload>,
): ApiResponse<readonly ApiNodePayload[]> => {
  const graph = request.context.session?.graph() ?? request.context.graph;
  const { authContext } = request.context;

  const { id, type, filter, sort, limit } = request.payload;

  if (id !== undefined) {
    const node = graph.nodes.get(id);
    if (!node) {
      return err(createApiAdapterError('NOT_FOUND', `Node not found: ${id}`));
    }
    if (authContext?.tenantId) {
      const tenant = node.properties.get('tenantId');
      if (tenant !== authContext.tenantId) {
        return err(createApiAdapterError('NOT_FOUND', `Node not found: ${id}`));
      }
    }
    return ok([mapNodeToPayload(node)]);
  }

  const baseSteps: readonly QueryStep[] = [{ kind: 'node-scan', type }];
  const tenantStep: readonly QueryStep[] = authContext?.tenantId
    ? [
        {
          kind: 'filter',
          predicate: { property: 'tenantId', operator: 'eq', value: authContext.tenantId },
        },
      ]
    : [];
  const filterStep: readonly QueryStep[] = filter ? [{ kind: 'filter', predicate: filter }] : [];
  const sortStep: readonly QueryStep[] = sort ? [{ kind: 'sort', sort }] : [];
  const limitStep: readonly QueryStep[] =
    limit !== undefined && limit > 0 ? [{ kind: 'limit', limit }] : [];

  const steps: readonly QueryStep[] = [
    ...baseSteps,
    ...tenantStep,
    ...filterStep,
    ...sortStep,
    ...limitStep,
  ];

  const queryResult = executeQueryEngine(graph, { steps });
  if (!queryResult.ok) {
    return err(createApiAdapterError('INTERNAL_ERROR', queryResult.error.message));
  }

  const nodes = queryResult.value.nodes.map(mapNodeToPayload);
  return ok(nodes);
};

// Executes an edge query against the graph context.
export const executeEdgeQuery = (
  request: ApiRequest<EdgeQueryPayload>,
): ApiResponse<readonly ApiEdgePayload[]> => {
  const graph = request.context.session?.graph() ?? request.context.graph;
  const { authContext } = request.context;
  const { id, type, source, target, limit } = request.payload;

  if (id !== undefined) {
    const edge = graph.edges.get(id);
    if (!edge) {
      return err(createApiAdapterError('NOT_FOUND', `Edge not found: ${id}`));
    }
    if (authContext?.tenantId) {
      const sourceNode = graph.nodes.get(edge.source);
      if (!sourceNode || sourceNode.properties.get('tenantId') !== authContext.tenantId) {
        return err(createApiAdapterError('NOT_FOUND', `Edge not found: ${id}`));
      }
    }
    return ok([mapEdgeToPayload(edge)]);
  }

  const maxCap = limit !== undefined && limit > 0 ? Math.min(limit, 1000) : 1000;
  const allEdges = [...graph.edges.values()];

  const matchingEdges = allEdges
    .filter((edge) => {
      if (type && edge.type !== type) return false;
      if (source && edge.source !== source) return false;
      if (target && edge.target !== target) return false;

      if (authContext?.tenantId) {
        const sourceNode = graph.nodes.get(edge.source);
        if (!sourceNode || sourceNode.properties.get('tenantId') !== authContext.tenantId) {
          return false;
        }
      }

      return true;
    })
    .slice(0, maxCap)
    .map(mapEdgeToPayload);

  return ok(matchingEdges);
};

// Executes a property lookup on a graph entity.
export const executePropertyLookup = (
  request: ApiRequest<PropertyLookupPayload>,
): ApiResponse<PropertyLookupResult> => {
  const graph = request.context.session?.graph() ?? request.context.graph;
  const { authContext } = request.context;
  const { entityId, propertyKey } = request.payload;

  const node = graph.nodes.get(entityId as never);
  const edge = graph.edges.get(entityId as never);
  const entity = node ?? edge;

  if (!entity) {
    return err(createApiAdapterError('NOT_FOUND', `Entity not found: ${entityId}`));
  }

  if (authContext?.tenantId) {
    if (node) {
      if (node.properties.get('tenantId') !== authContext.tenantId) {
        return err(createApiAdapterError('NOT_FOUND', `Entity not found: ${entityId}`));
      }
    } else if (edge) {
      const sourceNode = graph.nodes.get(edge.source);
      if (!sourceNode || sourceNode.properties.get('tenantId') !== authContext.tenantId) {
        return err(createApiAdapterError('NOT_FOUND', `Entity not found: ${entityId}`));
      }
    }
  }

  if (propertyKey !== undefined) {
    const propertyValue = entity.properties.get(propertyKey);
    if (propertyValue === undefined) {
      return err(
        createApiAdapterError(
          'NOT_FOUND',
          `Property key '${propertyKey}' not found on entity ${entityId}`,
        ),
      );
    }
    return ok({
      entityId,
      properties: { [propertyKey]: propertyValue },
    });
  }

  const allProperties = Object.fromEntries(entity.properties);
  return ok({
    entityId,
    properties: allProperties,
  });
};

interface QueueItem {
  readonly nodeId: string;
  readonly depth: number;
}

interface TraversalState {
  readonly visitedNodes: ReadonlySet<string>;
  readonly visitedEdges: ReadonlySet<string>;
  readonly nodePayloads: readonly ApiNodePayload[];
  readonly edgePayloads: readonly ApiEdgePayload[];
  readonly queue: readonly QueueItem[];
}

interface TraversalContext {
  readonly nodes: ReadonlyMap<string, Node>;
  readonly direction: 'in' | 'out' | 'both';
  readonly edgeType: TypeId | undefined;
  readonly tenantId: string | undefined;
  readonly effectiveMaxCost: number;
}

interface EdgeTraversalAccumulator {
  readonly visitedNodes: ReadonlySet<string>;
  readonly visitedEdges: ReadonlySet<string>;
  readonly nodePayloads: readonly ApiNodePayload[];
  readonly edgePayloads: readonly ApiEdgePayload[];
  readonly newQueueItems: readonly QueueItem[];
}

const stepSingleEdge = (
  current: QueueItem,
  edge: Readonly<Edge>,
  context: TraversalContext,
  accumulator: EdgeTraversalAccumulator,
): ApiResponse<EdgeTraversalAccumulator> => {
  const nextNodeId = resolveNextNodeId(edge, current.nodeId, context.direction, context.edgeType);
  if (!nextNodeId) {
    return ok(accumulator);
  }

  const nextNode = context.nodes.get(nextNodeId as never);
  const isTenantMatch =
    !context.tenantId || nextNode?.properties.get('tenantId') === context.tenantId;

  if (!nextNode || !isTenantMatch) {
    return ok(accumulator);
  }

  const edgeAlreadyVisited = accumulator.visitedEdges.has(edge.id);
  const nextVisitedEdges = edgeAlreadyVisited
    ? accumulator.visitedEdges
    : new Set([...accumulator.visitedEdges, edge.id]);
  const nextEdgePayloads = edgeAlreadyVisited
    ? accumulator.edgePayloads
    : [...accumulator.edgePayloads, mapEdgeToPayload(edge)];

  if (accumulator.visitedNodes.has(nextNodeId)) {
    return ok({
      ...accumulator,
      visitedEdges: nextVisitedEdges,
      edgePayloads: nextEdgePayloads,
    });
  }

  if (accumulator.visitedNodes.size >= context.effectiveMaxCost) {
    return err(
      createApiAdapterError(
        'RESOURCE_EXHAUSTED',
        `Traversal cost exceeded maximum limit of ${context.effectiveMaxCost}`,
      ),
    );
  }

  return ok({
    visitedNodes: new Set([...accumulator.visitedNodes, nextNodeId]),
    visitedEdges: nextVisitedEdges,
    nodePayloads: [...accumulator.nodePayloads, mapNodeToPayload(nextNode)],
    edgePayloads: nextEdgePayloads,
    newQueueItems: [...accumulator.newQueueItems, { nodeId: nextNodeId, depth: current.depth + 1 }],
  });
};

const stepEdgesRecursively = (
  current: QueueItem,
  remainingEdges: readonly Edge[],
  context: TraversalContext,
  accumulator: EdgeTraversalAccumulator,
): ApiResponse<EdgeTraversalAccumulator> => {
  if (remainingEdges.length === 0) {
    return ok(accumulator);
  }

  const [edge, ...restEdges] = remainingEdges;
  if (!edge) {
    return ok(accumulator);
  }

  const stepResult = stepSingleEdge(current, edge, context, accumulator);
  if (!stepResult.ok) {
    return stepResult;
  }

  return stepEdgesRecursively(current, restEdges, context, stepResult.value);
};

// Executes a graph traversal query with BFS cycle safety and depth/cost constraints.
export const executeGraphTraversal = (
  request: ApiRequest<TraversalQueryPayload>,
): ApiResponse<ApiTraversalPayload> => {
  const graph = request.context.session?.graph() ?? request.context.graph;
  const { authContext, limits } = request.context;
  const { startNodeIds, edgeType, direction = 'out', maxDepth, maxCost } = request.payload;

  if (!startNodeIds || startNodeIds.length === 0) {
    return err(createApiAdapterError('VALIDATION_ERROR', 'startNodeIds must not be empty'));
  }

  const effectiveMaxDepth = Math.min(
    maxDepth ?? limits?.maxQueryDepth ?? 10,
    limits?.maxQueryDepth ?? 10,
  );
  const effectiveMaxCost = Math.min(
    maxCost ?? limits?.maxQueryCost ?? 1000,
    limits?.maxQueryCost ?? 1000,
  );

  const initialValidNodes = startNodeIds.flatMap((id) => {
    const node = graph.nodes.get(id);
    if (!node) return [];
    if (authContext?.tenantId && node.properties.get('tenantId') !== authContext.tenantId) {
      return [];
    }
    return [{ id, node }];
  });

  const initialState: TraversalState = {
    visitedNodes: new Set(initialValidNodes.map((n) => n.id)),
    visitedEdges: new Set(),
    nodePayloads: initialValidNodes.map((n) => mapNodeToPayload(n.node)),
    edgePayloads: [],
    queue: initialValidNodes.map((n) => ({ nodeId: n.id, depth: 0 })),
  };

  const edgeList = [...graph.edges.values()];
  const traversalContext: TraversalContext = {
    nodes: graph.nodes,
    direction,
    edgeType,
    tenantId: authContext?.tenantId,
    effectiveMaxCost,
  };

  const runTraversal = (state: TraversalState): ApiResponse<ApiTraversalPayload> => {
    if (state.queue.length === 0) {
      return ok({
        nodes: state.nodePayloads,
        edges: state.edgePayloads,
      });
    }

    const [current, ...restQueue] = state.queue;
    if (!current || current.depth >= effectiveMaxDepth) {
      return runTraversal({
        ...state,
        queue: restQueue,
      });
    }

    const initialAccumulator: EdgeTraversalAccumulator = {
      visitedNodes: state.visitedNodes,
      visitedEdges: state.visitedEdges,
      nodePayloads: state.nodePayloads,
      edgePayloads: state.edgePayloads,
      newQueueItems: [],
    };

    const stepResult = stepEdgesRecursively(
      current,
      edgeList,
      traversalContext,
      initialAccumulator,
    );

    if (!stepResult.ok) {
      return stepResult;
    }

    return runTraversal({
      visitedNodes: stepResult.value.visitedNodes,
      visitedEdges: stepResult.value.visitedEdges,
      nodePayloads: stepResult.value.nodePayloads,
      edgePayloads: stepResult.value.edgePayloads,
      queue: [...restQueue, ...stepResult.value.newQueueItems],
    });
  };

  return runTraversal(initialState);
};

export const executeQuery = {
  getNode: (context: ApiAdapterContext, id: NodeId): ApiResponse<ApiNodePayload> => {
    const result = executeNodeQuery(createApiRequest('gql-get-node', context, { id }));
    if (!result.ok) return result;
    const node = result.value[0];
    if (!node) {
      return err(createApiAdapterError('NOT_FOUND', `Node not found: ${id}`));
    }
    return ok(node);
  },
  getNodes: (
    context: ApiAdapterContext,
    options: Readonly<{ type?: TypeId | undefined; limit?: number | undefined }>,
  ): ApiResponse<readonly ApiNodePayload[]> => {
    return executeNodeQuery(
      createApiRequest('gql-get-nodes', context, {
        type: options.type,
        limit: options.limit,
      }),
    );
  },
  getEdges: (
    context: ApiAdapterContext,
    options: Readonly<{
      source?: NodeId | undefined;
      target?: NodeId | undefined;
      type?: TypeId | undefined;
    }>,
  ): ApiResponse<readonly ApiEdgePayload[]> => {
    return executeEdgeQuery(
      createApiRequest('gql-get-edges', context, {
        source: options.source,
        target: options.target,
        type: options.type,
      }),
    );
  },
  traverse: (
    context: ApiAdapterContext,
    options: Readonly<{
      startNodeIds: readonly NodeId[];
      edgeType?: TypeId | undefined;
      maxDepth?: number | undefined;
    }>,
  ): ApiResponse<ApiTraversalPayload> => {
    return executeGraphTraversal(
      createApiRequest('gql-traverse', context, {
        startNodeIds: options.startNodeIds,
        edgeType: options.edgeType,
        maxDepth: options.maxDepth,
      }),
    );
  },
};
