import { describe, it, expect } from 'vitest';
import { createGraph, createNodeId, createInstant, Graph, Node } from '@canopy/types';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from '../system';
import { insertBlock } from './blocks';
import { addNode } from './node';

function createTestGraph(): Graph {
  return {
    nodes: new Map(),
    edges: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
    },
  };
}

function createBlockNode(idStr: string): Node {
  return {
    id: createNodeId(idStr),
    type: SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK,
    properties: new Map([['content', 'test']]),
    metadata: { created: createInstant(), modified: createInstant() },
  };
}

describe('ops/blocks', () => {
  it('inserts a block at start (no children)', () => {
    let graph = createTestGraph();
    const parentId = createNodeId('parent');
    const parentNode: Node = {
        id: parentId,
        type: SYSTEM_IDS.NODE_TYPE, // Dummy type
        properties: new Map(),
        metadata: { created: createInstant(), modified: createInstant() },
    };
    graph = addNode(graph, parentNode).value.value;

    const block = createBlockNode('block1');
    const result = insertBlock(graph, parentId, block);

    expect(result.ok).toBe(true);
    const newGraph = result.value.value;
    expect(newGraph.nodes.has(block.id)).toBe(true);

    const edges = Array.from(newGraph.edges.values());
    expect(edges.length).toBe(1);
    expect(edges[0].type).toBe(SYSTEM_EDGE_TYPES.CHILD_OF);
    expect(edges[0].properties.get('position')).toBe('a0');
  });

  it('inserts a block after another block', () => {
    let graph = createTestGraph();
    const parentId = createNodeId('parent');
    graph = addNode(graph, {
        id: parentId,
        type: SYSTEM_IDS.NODE_TYPE,
        properties: new Map(),
        metadata: { created: createInstant(), modified: createInstant() },
    }).value.value;

    const block1 = createBlockNode('block1');
    graph = insertBlock(graph, parentId, block1).value.value; // Pos a0

    const block2 = createBlockNode('block2');
    // Insert after block1
    const result = insertBlock(graph, parentId, block2, block1.id);
    expect(result.ok).toBe(true);
    const newGraph = result.value.value;

    const edges = Array.from(newGraph.edges.values()).filter(e => e.type === SYSTEM_EDGE_TYPES.CHILD_OF);
    const edge1 = edges.find(e => e.source === block1.id);
    const edge2 = edges.find(e => e.source === block2.id);

    expect(edge1?.properties.get('position')).toBe('a0');
    // a0 -> null. > a0. 'b' or 'a1' or similar.
    const pos2 = edge2?.properties.get('position') as string;
    expect(pos2 > 'a0').toBe(true);
  });

  it('inserts a block between two blocks', () => {
    let graph = createTestGraph();
    const parentId = createNodeId('parent');
    graph = addNode(graph, {
        id: parentId,
        type: SYSTEM_IDS.NODE_TYPE,
        properties: new Map(),
        metadata: { created: createInstant(), modified: createInstant() },
    }).value.value;

    const block1 = createBlockNode('block1');
    const block3 = createBlockNode('block3');

    // Manually setup block1 at "a0" and block3 at "a2" to test insertion
    // But insertBlock generates positions.
    // Insert 1.
    graph = insertBlock(graph, parentId, block1).value.value; // a0
    // Insert 3 after 1.
    const res3 = insertBlock(graph, parentId, block3, block1.id); // e.g. 'b'
    graph = res3.value.value;

    // Now insert 2 after 1 (so between 1 and 3)
    const block2 = createBlockNode('block2');
    const res2 = insertBlock(graph, parentId, block2, block1.id);
    expect(res2.ok).toBe(true);
    const newGraph = res2.value.value;

    const edges = Array.from(newGraph.edges.values()).filter(e => e.type === SYSTEM_EDGE_TYPES.CHILD_OF);
    const pos1 = edges.find(e => e.source === block1.id)?.properties.get('position') as string;
    const pos2 = edges.find(e => e.source === block2.id)?.properties.get('position') as string;
    const pos3 = edges.find(e => e.source === block3.id)?.properties.get('position') as string;

    expect(pos1 < pos2).toBe(true);
    expect(pos2 < pos3).toBe(true);
  });

  it('inserts at start (before existing)', () => {
      let graph = createTestGraph();
      const parentId = createNodeId('parent');
      graph = addNode(graph, {
          id: parentId,
          type: SYSTEM_IDS.NODE_TYPE,
          properties: new Map(),
          metadata: { created: createInstant(), modified: createInstant() },
      }).value.value;

      const block1 = createBlockNode('block1');
      graph = insertBlock(graph, parentId, block1).value.value; // a0

      const block0 = createBlockNode('block0');
      // Insert with no prevBlockId -> start
      const result = insertBlock(graph, parentId, block0);
      expect(result.ok).toBe(true);
      const newGraph = result.value.value;

      const edges = Array.from(newGraph.edges.values()).filter(e => e.type === SYSTEM_EDGE_TYPES.CHILD_OF);
      const pos0 = edges.find(e => e.source === block0.id)?.properties.get('position') as string;
      const pos1 = edges.find(e => e.source === block1.id)?.properties.get('position') as string;

      expect(pos0 < pos1).toBe(true);
  });
});
