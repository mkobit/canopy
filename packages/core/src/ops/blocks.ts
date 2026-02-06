import type { Graph, Node, NodeId, Result, GraphResult, Edge } from '@canopy/types';
import { createInstant, ok, err, createEdgeId } from '@canopy/types';
import { addNode } from './node';
import { addEdge } from './edge';
import { SYSTEM_EDGE_TYPES } from '../system';
import { generateKeyBetween } from './fractional-index';

export function insertBlock(
  graph: Graph,
  parentId: NodeId,
  block: Node,
  prevBlockId?: NodeId,
): Result<GraphResult<Graph>, Error> {
  // 1. Add the block node
  const nodeResult = addNode(graph, block);
  if (!nodeResult.ok) return nodeResult;

  const graphWithNode = nodeResult.value.graph;
  const nodeEvents = nodeResult.value.events;

  // 2. Find siblings to determine position
  // Filter edges: target == parentId AND type == CHILD_OF
  const siblings = [...graphWithNode.edges.values()]
    .filter((e) => e.target === parentId && e.type === SYSTEM_EDGE_TYPES.CHILD_OF)
    .sort((a, b) => {
      const posA = (a.properties.get('position') as string) || '';
      const posB = (b.properties.get('position') as string) || '';
      if (posA < posB) return -1;
      if (posA > posB) return 1;
      return 0;
    });

  // Validate prevBlockId if provided
  if (prevBlockId) {
    const prevEdgeIndex = siblings.findIndex((e) => e.source === prevBlockId);
    if (prevEdgeIndex === -1) {
      return err(new Error(`prevBlockId ${prevBlockId} is not a child of ${parentId}`));
    }
    const prevEdge = siblings[prevEdgeIndex];
    if (!prevEdge) {
      return err(new Error(`prevEdge not found at index ${prevEdgeIndex}`));
    }
  }

  // Calculate position
  const { prevPos, nextPos } = prevBlockId
    ? (() => {
        const prevEdgeIndex = siblings.findIndex((e) => e.source === prevBlockId);
        const prevEdge = siblings[prevEdgeIndex]!;
        const nextEdge = siblings[prevEdgeIndex + 1];
        return {
          prevPos: (prevEdge.properties.get('position') as string) || null,
          nextPos: nextEdge ? ((nextEdge.properties.get('position') as string) || null) : null,
        };
      })()
    : {
        prevPos: null,
        nextPos: siblings[0] ? ((siblings[0].properties.get('position') as string) || null) : null,
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
    },
  };

  const edgeResult = addEdge(graphWithNode, edge);
  if (!edgeResult.ok) return edgeResult;

  const finalGraph = edgeResult.value.graph;
  const edgeEvents = edgeResult.value.events;

  return ok({
    graph: finalGraph,
    events: [...nodeEvents, ...edgeEvents],
    value: finalGraph,
  });
}
