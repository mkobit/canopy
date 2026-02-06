import { describe, it, expect } from 'vitest';
import { createNodeId, createInstant, Graph, Node, createGraphId } from '@canopy/types';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from '../system';
import { insertBlock } from './blocks';
import { addNode } from './node';

function createTestGraph(): Graph {
  return {
    id: createGraphId(),
    name: 'test-graph',
    nodes: new Map(),
    edges: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
    },
  };
}

function createBlockNode(): Node {
  return {
    id: createNodeId(),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: new Map([['content', 'test']]),
    metadata: { created: createInstant(), modified: createInstant() },
  };
}

describe('ops/blocks', () => {
  it('inserts a block at start (no children)', () => {
    let graph = createTestGraph();
    const parentId = createNodeId();
    const parentNode: Node = {
      id: parentId,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    const addResult = addNode(graph, parentNode);
    if (!addResult.ok) throw new Error('Failed to add parent node');
    graph = addResult.value.value;

    const block = createBlockNode();
    const result = insertBlock(graph, parentId, block);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Failed to insert block');
    const newGraph = result.value.value;
    expect(newGraph.nodes.has(block.id)).toBe(true);

    const edges = [...newGraph.edges.values()];
    expect(edges.length).toBe(1);
    expect(edges[0]?.type).toBe(SYSTEM_EDGE_TYPES.CHILD_OF);
    expect(edges[0]?.properties.get('position')).toBe('a0');
  });

  it('inserts a block after another block', () => {
    let graph = createTestGraph();
    const parentId = createNodeId();
    const addParentResult = addNode(graph, {
      id: parentId,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    });
    if (!addParentResult.ok) throw new Error('Failed to add parent');
    graph = addParentResult.value.value;

    const block1 = createBlockNode();
    const insert1Result = insertBlock(graph, parentId, block1);
    if (!insert1Result.ok) throw new Error('Failed to insert block1');
    graph = insert1Result.value.value;

    const block2 = createBlockNode();
    const result = insertBlock(graph, parentId, block2, block1.id);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Failed to insert block2');
    const newGraph = result.value.value;

    const edges = [...newGraph.edges.values()].filter((e) => e.type === SYSTEM_EDGE_TYPES.CHILD_OF);
    const edge1 = edges.find((e) => e.source === block1.id);
    const edge2 = edges.find((e) => e.source === block2.id);

    expect(edge1?.properties.get('position')).toBe('a0');
    const pos2 = edge2?.properties.get('position') as string;
    expect(pos2 > 'a0').toBe(true);
  });

  it('inserts a block between two blocks', () => {
    let graph = createTestGraph();
    const parentId = createNodeId();
    const addParentResult = addNode(graph, {
      id: parentId,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    });
    if (!addParentResult.ok) throw new Error('Failed to add parent');
    graph = addParentResult.value.value;

    const block1 = createBlockNode();
    const block3 = createBlockNode();

    const insert1Result = insertBlock(graph, parentId, block1);
    if (!insert1Result.ok) throw new Error('Failed to insert block1');
    graph = insert1Result.value.value;

    const res3 = insertBlock(graph, parentId, block3, block1.id);
    if (!res3.ok) throw new Error('Failed to insert block3');
    graph = res3.value.value;

    const block2 = createBlockNode();
    const res2 = insertBlock(graph, parentId, block2, block1.id);
    expect(res2.ok).toBe(true);
    if (!res2.ok) throw new Error('Failed to insert block2');
    const newGraph = res2.value.value;

    const edges = [...newGraph.edges.values()].filter((e) => e.type === SYSTEM_EDGE_TYPES.CHILD_OF);
    const pos1 = edges.find((e) => e.source === block1.id)?.properties.get('position') as string;
    const pos2 = edges.find((e) => e.source === block2.id)?.properties.get('position') as string;
    const pos3 = edges.find((e) => e.source === block3.id)?.properties.get('position') as string;

    expect(pos1 < pos2).toBe(true);
    expect(pos2 < pos3).toBe(true);
  });

  it('inserts at start (before existing)', () => {
    let graph = createTestGraph();
    const parentId = createNodeId();
    const addParentResult = addNode(graph, {
      id: parentId,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    });
    if (!addParentResult.ok) throw new Error('Failed to add parent');
    graph = addParentResult.value.value;

    const block1 = createBlockNode();
    const insert1Result = insertBlock(graph, parentId, block1);
    if (!insert1Result.ok) throw new Error('Failed to insert block1');
    graph = insert1Result.value.value;

    const block0 = createBlockNode();
    const result = insertBlock(graph, parentId, block0);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Failed to insert block0');
    const newGraph = result.value.value;

    const edges = [...newGraph.edges.values()].filter((e) => e.type === SYSTEM_EDGE_TYPES.CHILD_OF);
    const pos0 = edges.find((e) => e.source === block0.id)?.properties.get('position') as string;
    const pos1 = edges.find((e) => e.source === block1.id)?.properties.get('position') as string;

    expect(pos0 < pos1).toBe(true);
  });
});
