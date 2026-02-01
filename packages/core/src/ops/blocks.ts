import {
  Graph,
  Node,
  NodeId,
  Result,
  GraphResult,
  Edge,
  createInstant,
  ok,
  err,
  createEdgeId,
} from '@canopy/types';
import { addNode } from './node';
import { addEdge } from './edge';
import { SYSTEM_EDGE_TYPES } from '../system';
import { generateKeyBetween } from './fractional-index';

export function insertBlock(
  graph: Graph,
  parentId: NodeId,
  block: Node,
  prevBlockId?: NodeId
): Result<GraphResult<Graph>, Error> {
  // 1. Add the block node
  const nodeResult = addNode(graph, block);
  if (!nodeResult.ok) return nodeResult;

  const graphWithNode = nodeResult.value.graph;
  const nodeEvents = nodeResult.value.events;

  // 2. Find siblings to determine position
  // Filter edges: target == parentId AND type == CHILD_OF
  const siblings = Array.from(graphWithNode.edges.values())
    .filter(
      (e) =>
        e.target === parentId &&
        e.type === SYSTEM_EDGE_TYPES.CHILD_OF
    )
    .sort((a, b) => {
      const posA = (a.properties.get('position') as string) || '';
      const posB = (b.properties.get('position') as string) || '';
      if (posA < posB) return -1;
      if (posA > posB) return 1;
      return 0;
    });

  let prevPos: string | null = null;
  let nextPos: string | null = null;

  if (prevBlockId) {
    const prevEdgeIndex = siblings.findIndex((e) => e.source === prevBlockId);
    if (prevEdgeIndex === -1) {
       return err(new Error(`prevBlockId ${prevBlockId} is not a child of ${parentId}`));
    }
    const prevEdge = siblings[prevEdgeIndex];
    prevPos = (prevEdge.properties.get('position') as string) || null;

    const nextEdge = siblings[prevEdgeIndex + 1];
    if (nextEdge) {
      nextPos = (nextEdge.properties.get('position') as string) || null;
    }
  } else {
    // Insert at start
    const firstEdge = siblings[0];
    if (firstEdge) {
      nextPos = (firstEdge.properties.get('position') as string) || null;
    }
  }

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
    }
  };

  const edgeResult = addEdge(graphWithNode, edge);
  if (!edgeResult.ok) return edgeResult;

  const finalGraph = edgeResult.value.graph;
  const edgeEvents = edgeResult.value.events;

  return ok({
    graph: finalGraph,
    events: [...nodeEvents, ...edgeEvents],
    value: finalGraph
  });
}
