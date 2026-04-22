import { describe, it, expect } from 'bun:test';
import { findNode } from '../src/utils';
import { asNodeId, asTypeId, createInstant, createGraphId, asDeviceId } from '@canopy/types';
import type { Graph, Node } from '@canopy/types';

describe('findNode', () => {
  const SYSTEM_DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');

  function mockNode(id: string, name: string): Node {
    return {
      id: asNodeId(id),
      type: asTypeId('test'),
      properties: new Map([['name', name]]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    };
  }

  it('finds a node that matches the predicate', () => {
    const node1 = mockNode('n1', 'Alice');
    const node2 = mockNode('n2', 'Bob');
    const graph: Graph = {
      id: createGraphId(),
      name: 'Test',
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
      nodes: new Map([
        [node1.id, node1],
        [node2.id, node2],
      ]),
      edges: new Map(),
    };

    const found = findNode(graph, (n) => n.properties.get('name') === 'Bob');
    expect(found).toBe(node2);
  });

  it('returns undefined when no node matches', () => {
    const node1 = mockNode('n1', 'Alice');
    const graph: Graph = {
      id: createGraphId(),
      name: 'Test',
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
      nodes: new Map([[node1.id, node1]]),
      edges: new Map(),
    };

    const found = findNode(graph, (n) => n.properties.get('name') === 'Charlie');
    expect(found).toBeUndefined();
  });

  it('returns undefined for an empty graph', () => {
    const graph: Graph = {
      id: createGraphId(),
      name: 'Empty',
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
      nodes: new Map(),
      edges: new Map(),
    };

    const found = findNode(graph, () => true);
    expect(found).toBeUndefined();
  });

  it('stops iterating once a match is found', () => {
    const node1 = mockNode('n1', 'Alice');
    const node2 = mockNode('n2', 'Bob');
    const node3 = mockNode('n3', 'Charlie');
    const graph: Graph = {
      id: createGraphId(),
      name: 'Test',
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
      nodes: new Map([
        [node1.id, node1],
        [node2.id, node2],
        [node3.id, node3],
      ]),
      edges: new Map(),
    };

    const visitedIds: string[] = [];
    const found = findNode(graph, (n) => {
      visitedIds.push(n.id);
      return n.properties.get('name') === 'Bob';
    });

    expect(found).toBe(node2);
    expect(visitedIds).toEqual([node1.id, node2.id]);
  });
});
