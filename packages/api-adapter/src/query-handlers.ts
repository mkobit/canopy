import type { Edge, Node, TypeId } from '@canopy/graph';
import { err, ok } from '@canopy/graph';
import type { QueryStep } from '@canopy/queries';
import { executeQuery } from '@canopy/queries';
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
  const { graph, authContext } = request.context;
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

  const queryResult = executeQuery(graph, { steps });
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
  const { graph, authContext } = request.context;
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
  const { graph, authContext } = request.context;
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
    const propValue = entity.properties.get(propertyKey);
    if (propValue === undefined) {
      return err(
        createApiAdapterError(
          'NOT_FOUND',
          `Property key '${propertyKey}' not found on entity ${entityId}`,
        ),
      );
    }
    return ok({
      entityId,
      properties: { [propertyKey]: propValue },
    });
  }

  const allProps = Object.fromEntries(entity.properties);
  return ok({
    entityId,
    properties: allProps,
  });
};

interface QueueItem {
  readonly nodeId: string;
  readonly depth: number;
}

// Executes a graph traversal query with BFS cycle safety and depth/cost constraints.
export const executeGraphTraversal = (
  request: ApiRequest<TraversalQueryPayload>,
): ApiResponse<ApiTraversalPayload> => {
  const { graph, authContext, limits } = request.context;
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

  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  // eslint-disable-next-line functional/prefer-immutable-types -- local accumulator
  const nodePayloads: ApiNodePayload[] = [];
  // eslint-disable-next-line functional/prefer-immutable-types -- local accumulator
  const edgePayloads: ApiEdgePayload[] = [];
  // eslint-disable-next-line functional/prefer-immutable-types -- local BFS queue
  const queue: QueueItem[] = [];

  // eslint-disable-next-line functional/no-loop-statements -- BFS graph traversal start nodes
  for (const id of startNodeIds) {
    const node = graph.nodes.get(id);
    if (node) {
      if (authContext?.tenantId && node.properties.get('tenantId') !== authContext.tenantId) {
        continue;
      }
      // eslint-disable-next-line functional/immutable-data -- track visited nodes
      visitedNodes.add(id);
      // eslint-disable-next-line functional/immutable-data -- accumulate node payloads
      nodePayloads.push(mapNodeToPayload(node));
      // eslint-disable-next-line functional/immutable-data -- enqueue start node
      queue.push({ nodeId: id, depth: 0 });
    }
  }

  // eslint-disable-next-line functional/no-loop-statements -- BFS graph traversal loop
  while (queue.length > 0) {
    // eslint-disable-next-line functional/immutable-data -- dequeue current node from BFS queue
    const current = queue.shift();
    if (current && current.depth < effectiveMaxDepth) {
      // eslint-disable-next-line functional/no-loop-statements -- scan outgoing edges for current node
      for (const edge of graph.edges.values()) {
        const nextNodeId = resolveNextNodeId(edge, current.nodeId, direction, edgeType);

        if (nextNodeId) {
          const nextNode = graph.nodes.get(nextNodeId as never);
          const isTenantMatch =
            !authContext?.tenantId || nextNode?.properties.get('tenantId') === authContext.tenantId;

          if (nextNode && isTenantMatch) {
            if (!visitedEdges.has(edge.id)) {
              // eslint-disable-next-line functional/immutable-data -- track visited edges
              visitedEdges.add(edge.id);
              // eslint-disable-next-line functional/immutable-data -- accumulate edge payloads
              edgePayloads.push(mapEdgeToPayload(edge));
            }

            if (!visitedNodes.has(nextNodeId)) {
              if (visitedNodes.size >= effectiveMaxCost) {
                return err(
                  createApiAdapterError(
                    'RESOURCE_EXHAUSTED',
                    `Traversal cost exceeded maximum limit of ${effectiveMaxCost}`,
                  ),
                );
              }

              // eslint-disable-next-line functional/immutable-data -- track visited nodes
              visitedNodes.add(nextNodeId);
              // eslint-disable-next-line functional/immutable-data -- accumulate node payloads
              nodePayloads.push(mapNodeToPayload(nextNode));
              // eslint-disable-next-line functional/immutable-data -- enqueue next node for BFS
              queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
            }
          }
        }
      }
    }
  }

  return ok({
    nodes: nodePayloads,
    edges: edgePayloads,
  });
};
