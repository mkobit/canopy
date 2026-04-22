import { createGraph } from '../src/graph';
import { addNode, removeNode } from '../src/ops/node';
import { addEdge } from '../src/ops/edge';
import type { Node, Edge, Graph, NodeId } from '@canopy/types';
import {
  createGraphId,
  createNodeId,
  createEdgeId,
  asTypeId,
  asDeviceId,
  unwrap,
  createInstant,
} from '@canopy/types';

const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');
const nodeType = asTypeId('test-node');
const edgeType = asTypeId('test-edge');

function setupGraph(nodeCount: number, edgeCount: number) {
  const initialGraph = unwrap(createGraph(createGraphId(), 'Test Graph'));
  // eslint-disable-next-line functional/no-let
  let g = initialGraph;
  const nodeIds: NodeId[] = [];

  // eslint-disable-next-line functional/no-loop-statements
  for (let i = 0; i < nodeCount; i++) {
    const id = createNodeId();
    // eslint-disable-next-line functional/immutable-data
    nodeIds.push(id);
    const node: Node = {
      id,
      type: nodeType,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    g = unwrap(addNode(g, node, { deviceId })).graph;
  }

  // eslint-disable-next-line functional/no-loop-statements
  for (let i = 0; i < edgeCount; i++) {
    const source = nodeIds[Math.floor(Math.random() * nodeIds.length)];
    const target = nodeIds[Math.floor(Math.random() * nodeIds.length)];
    const edge: Edge = {
      id: createEdgeId(),
      type: edgeType,
      source,
      target,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    g = unwrap(addEdge(g, edge, { deviceId })).graph;
  }

  return { graph: g, nodeIds };
}

const { graph: smallGraph, nodeIds: smallNodeIds } = setupGraph(100, 200);
const { graph: midGraph, nodeIds: midNodeIds } = setupGraph(1000, 2000);

// eslint-disable-next-line functional/no-return-void
function runBench(name: string, graph: Graph, nodeIds: NodeId[], iterations: number) {
  const start = performance.now();
  // eslint-disable-next-line functional/no-loop-statements
  for (let i = 0; i < iterations; i++) {
    const nodeId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
    removeNode(graph, nodeId, { deviceId });
  }
  const end = performance.now();
  // eslint-disable-next-line no-console
  console.log(
    `${name}: ${(end - start).toFixed(4)}ms (${((end - start) / iterations).toFixed(6)}ms/op)`,
  );
}

// eslint-disable-next-line no-console
console.log('Starting benchmarks...');
runBench('removeNode small graph (100 nodes, 200 edges)', smallGraph, smallNodeIds, 1000);
runBench('removeNode mid graph (1000 nodes, 2000 edges)', midGraph, midNodeIds, 1000);
