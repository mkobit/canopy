import { describe, it, expect } from 'bun:test';
import { findNode, generateExecutionId, createBatch } from '../src/utils';
import {
  asNodeId,
  asTypeId,
  createInstant,
  createGraphId,
  asDeviceId,
  asEventId,
} from '@canopy/types';
import type { Graph, Node, GraphEvent } from '@canopy/types';

describe('generateExecutionId', () => {
  it('returns a valid UUIDv7 format', () => {
    const id = generateExecutionId();
    // UUIDv7 format check: 8-4-4-4-12 hex digits, with version 7
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('generates unique IDs', () => {
    const id1 = generateExecutionId();
    const id2 = generateExecutionId();
    expect(id1).not.toBe(id2);
  });

  it('generates IDs that maintain sort order (time-based)', () => {
    const ids = Array.from({ length: 100 }, () => generateExecutionId());
    const sortedIds = ids.toSorted();
    expect(ids).toEqual(sortedIds);
  });
});

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

describe('createBatch', () => {
  const SYSTEM_DEVICE_ID = asDeviceId('00000000-0000-0000-0000-000000000000');

  it('assigns the same batchId and timestamp to all events', () => {
    const events: readonly Partial<GraphEvent>[] = [
      {
        type: 'NodeCreated',
        eventId: asEventId('e1'),
        id: asNodeId('n1'),
        nodeType: asTypeId('test'),
        properties: new Map(),
        deviceId: SYSTEM_DEVICE_ID,
      },
      {
        type: 'NodePropertiesUpdated',
        eventId: asEventId('e2'),
        id: asNodeId('n1'),
        changes: new Map([['name', 'Alice']]),
        deviceId: SYSTEM_DEVICE_ID,
      },
    ];

    const batch = createBatch(events);

    expect(batch).toHaveLength(2);

    const firstEvent = batch[0];
    const secondEvent = batch[1];

    if (!firstEvent || !secondEvent) {
      throw new Error('Batch should have 2 events');
    }

    expect(firstEvent.batchId).toBeDefined();
    expect(firstEvent.timestamp).toBeDefined();

    expect(firstEvent.batchId).toBe(secondEvent.batchId);
    expect(firstEvent.timestamp).toBe(secondEvent.timestamp);

    // Verify existing properties are preserved
    expect(firstEvent.type).toBe('NodeCreated');
    expect(firstEvent.eventId).toBe('e1');
    expect(secondEvent.type).toBe('NodePropertiesUpdated');
    expect(secondEvent.eventId).toBe('e2');
  });

  it('returns an empty array when given an empty array', () => {
    const batch = createBatch([]);
    expect(batch).toEqual([]);
  });
});
