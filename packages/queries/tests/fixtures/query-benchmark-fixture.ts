import type {
  Graph,
  GraphEvent,
  NodeId,
  EdgeId,
  TypeId,
  PropertyValue,
  Node,
  Edge,
} from '@canopy/graph';
import {
  createNodeId,
  createEdgeId,
  createEventId,
  createInstant,
  asTypeId,
  createGraphId,
  SYSTEM_DEVICE_ID,
} from '@canopy/graph';

export type NodeTypeId = TypeId;
export type EdgeTypeId = TypeId;
export const asNodeTypeId = asTypeId;
export const asEdgeTypeId = asTypeId;

export interface QueryBenchmarkFixtureOptions {
  readonly nodeCount: number;
  readonly edgeDensity?: number;
  readonly propertyCount?: number;
  readonly clusterCount?: number;
}

export interface QueryBenchmarkFixture {
  readonly graph: Graph;
  readonly events: readonly GraphEvent[];
  readonly sampleNodeIds: readonly NodeId[];
  readonly sampleEdgeTypes: readonly EdgeTypeId[];
  readonly sampleNodeTypes: readonly NodeTypeId[];
}

export function generateQueryBenchmarkFixture(
  options: QueryBenchmarkFixtureOptions,
): QueryBenchmarkFixture {
  const { nodeCount, edgeDensity = 2, propertyCount = 4 } = options;
  const events: GraphEvent[] = [];
  const sampleNodeIds: NodeId[] = [];
  const nodeTypeId = asNodeTypeId('benchmark:Node');
  const edgeTypeId = asEdgeTypeId('benchmark:Edge');

  const nodesMap = new Map<NodeId, Node>();
  const edgesMap = new Map<EdgeId, Edge>();

  const graphInstant = createInstant();
  const graphId = createGraphId();

  for (let nodeIndex = 0; nodeIndex < nodeCount; nodeIndex++) {
    const nodeId = createNodeId();
    sampleNodeIds.push(nodeId);

    const properties = new Map<string, PropertyValue>();
    for (let p = 0; p < propertyCount; p++) {
      properties.set(`prop_${p}`, `value_${nodeIndex % 10}_${p}`);
    }
    properties.set('category', `cat_${nodeIndex % 5}`);
    properties.set('index', nodeIndex);

    nodesMap.set(nodeId, {
      id: nodeId,
      type: nodeTypeId,
      properties,
      metadata: {
        created: graphInstant,
        modified: graphInstant,
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    });

    events.push({
      type: 'NodeCreated',
      eventId: createEventId(),
      id: nodeId,
      nodeType: nodeTypeId,
      properties,
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
      batchId: 'benchmark-batch',
    });
  }

  // Generate edges for topology traversal testing
  const targetEdgeCount = Math.floor(nodeCount * edgeDensity);
  for (let edgeIndex = 0; edgeIndex < targetEdgeCount; edgeIndex++) {
    const sourceIndex = edgeIndex % nodeCount;
    const targetIndex = (edgeIndex + 1 + Math.floor(edgeIndex / nodeCount)) % nodeCount;
    if (sourceIndex === targetIndex) continue;

    const sourceId = sampleNodeIds[sourceIndex];
    const targetId = sampleNodeIds[targetIndex];
    if (!sourceId || !targetId) continue;

    const edgeId = createEdgeId();

    edgesMap.set(edgeId, {
      id: edgeId,
      type: edgeTypeId,
      source: sourceId,
      target: targetId,
      properties: new Map(),
      metadata: {
        created: graphInstant,
        modified: graphInstant,
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    });

    events.push({
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: edgeId,
      edgeType: edgeTypeId,
      source: sourceId,
      target: targetId,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
      batchId: 'benchmark-batch',
    });
  }

  const graph: Graph = {
    id: graphId,
    name: 'benchmark-graph',
    metadata: {
      created: graphInstant,
      modified: graphInstant,
      modifiedBy: SYSTEM_DEVICE_ID,
    },
    nodes: nodesMap,
    edges: edgesMap,
  };

  return {
    graph,
    events,
    sampleNodeIds,
    sampleEdgeTypes: [edgeTypeId],
    sampleNodeTypes: [nodeTypeId],
  };
}
