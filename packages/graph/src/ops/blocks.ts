import type { Graph } from '../graph';
import type { Node } from '../node';
import type { Edge } from '../edge';
import type { NodeId, DeviceId } from '../identifiers';
import type { Result } from '../result';
import type { GraphResult } from '../events';
import { createInstant, createEdgeId } from '../factories';
import { ok, err as error } from '../result';
import { addNode } from './node';
import { addEdge } from './edge';
import { SYSTEM_EDGE_TYPES } from '../system';
import { generateKeyBetween } from './fractional-index';

export type InsertBlockOptions = Readonly<{
  deviceId: DeviceId;
  validate?: boolean;
  batchId?: string;
  migrationId?: string;
}>;

export function insertBlock(
  graph: Graph,
  parentId: NodeId,
  block: Node,
  previousBlockId: NodeId | undefined,
  options: InsertBlockOptions,
): Result<GraphResult<Graph>, Error> {
  // 1. Add the block node
  const nodeResult = addNode(graph, block, {
    deviceId: options.deviceId,
    ...(options.validate !== undefined && { validate: options.validate }),
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  });
  if (!nodeResult.ok) return nodeResult;

  const graphWithNode = nodeResult.value.graph;
  const nodeEvents = nodeResult.value.events;

  // 2. Find siblings to determine position
  // Filter edges: target == parentId AND type == CHILD_OF
  const siblings = [...graphWithNode.edges.values()]
    .filter((edge) => edge.target === parentId && edge.type === SYSTEM_EDGE_TYPES.CHILD_OF)
    .toSorted((a, b) => {
      const posA = (a.properties.get('position') as string) || '';
      const posB = (b.properties.get('position') as string) || '';
      if (posA < posB) return -1;
      if (posA > posB) return 1;
      return 0;
    });

  // Validate prevBlockId if provided
  if (previousBlockId) {
    const previousEdgeIndex = siblings.findIndex((edge) => edge.source === previousBlockId);
    if (previousEdgeIndex === -1) {
      return error(new Error(`prevBlockId ${previousBlockId} is not a child of ${parentId}`));
    }
    const previousEdge = siblings[previousEdgeIndex];
    if (!previousEdge) {
      return error(new Error(`prevEdge not found at index ${previousEdgeIndex}`));
    }
  }

  // Calculate position
  const { prevPos, nextPos } = previousBlockId
    ? (() => {
        const previousEdgeIndex = siblings.findIndex((edge) => edge.source === previousBlockId);
        const previousEdge = siblings[previousEdgeIndex];
        if (!previousEdge) {
          return { prevPos: null, nextPos: null };
        }
        const nextEdge = siblings[previousEdgeIndex + 1];
        return {
          prevPos: (previousEdge.properties.get('position') as string) || null,
          nextPos: nextEdge ? (nextEdge.properties.get('position') as string) || null : null,
        };
      })()
    : {
        prevPos: null,
        nextPos: siblings[0] ? (siblings[0].properties.get('position') as string) || null : null,
      };

  const newPos = generateKeyBetween(prevPos, nextPos);

  // 3. Create child_of edge
  const edgeId = createEdgeId();

  const edge: Edge = {
    id: edgeId,
    type: SYSTEM_EDGE_TYPES.CHILD_OF,
    source: block.id,
    target: parentId,
    properties: new Map([['position', newPos]]),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const edgeResult = addEdge(graphWithNode, edge, {
    deviceId: options.deviceId,
    ...(options.validate !== undefined && { validate: options.validate }),
    ...(options.batchId !== undefined && { batchId: options.batchId }),
    ...(options.migrationId !== undefined && { migrationId: options.migrationId }),
  });
  if (!edgeResult.ok) return edgeResult;

  const finalGraph = edgeResult.value.graph;
  const edgeEvents = edgeResult.value.events;

  return ok({
    graph: finalGraph,
    events: [...nodeEvents, ...edgeEvents],
    value: finalGraph,
  });
}
