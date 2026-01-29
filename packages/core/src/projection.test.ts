import { describe, it, expect } from 'vitest';
import {
  createInstant,
  createNodeId,
  createEdgeId,
  createEventId,
  asTypeId,
  unwrap,
  createGraphId,
} from '@canopy/types';
import type { GraphEvent } from '@canopy/types';
import { projectGraph } from './projection';

describe('Graph Projection', () => {
  it('should reconstruct a graph from events', () => {
    const nodeId1 = createNodeId();
    const nodeId2 = createNodeId();
    const edgeId = createEdgeId();
    const now = createInstant();

    const events: GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId1,
        nodeType: asTypeId('test:node'),
        properties: new Map([['name', 'Node 1']]),
        timestamp: now,
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId2,
        nodeType: asTypeId('test:node'),
        properties: new Map([['name', 'Node 2']]),
        timestamp: now,
      },
      {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: edgeId,
        edgeType: asTypeId('test:edge'),
        source: nodeId1,
        target: nodeId2,
        properties: new Map([['weight', 1]]),
        timestamp: now,
      },
      {
        type: 'NodePropertiesUpdated',
        eventId: createEventId(),
        id: nodeId1,
        changes: new Map([['name', 'Updated Node 1']]),
        timestamp: now,
      },
    ];

    const graph = unwrap(projectGraph(events));

    // We can't check exact size because bootstrap adds system nodes
    expect(graph.nodes.has(nodeId1)).toBe(true);
    expect(graph.nodes.has(nodeId2)).toBe(true);
    expect(graph.edges.has(edgeId)).toBe(true);

    const node1 = graph.nodes.get(nodeId1);
    expect(node1).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(node1!.properties.get('name')).toBe('Updated Node 1');

    const edge = graph.edges.get(edgeId);
    expect(edge).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(edge!.source).toBe(nodeId1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(edge!.target).toBe(nodeId2);
  });

  it('should handle deletion', () => {
    const nodeId = createNodeId();
    const events: GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId,
        nodeType: asTypeId('test:node'),
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'NodeDeleted',
        eventId: createEventId(),
        id: nodeId,
        timestamp: createInstant(),
      },
    ];

    const graph = unwrap(projectGraph(events));
    expect(graph.nodes.has(nodeId)).toBe(false);
  });

  it('should handle edge deletion', () => {
    const nodeId1 = createNodeId();
    const nodeId2 = createNodeId();
    const edgeId = createEdgeId();

    const events: GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId1,
        nodeType: asTypeId('test:node'),
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId2,
        nodeType: asTypeId('test:node'),
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: edgeId,
        edgeType: asTypeId('test:edge'),
        source: nodeId1,
        target: nodeId2,
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'EdgeDeleted',
        eventId: createEventId(),
        id: edgeId,
        timestamp: createInstant(),
      },
    ];

    const graph = unwrap(projectGraph(events));
    expect(graph.edges.has(edgeId)).toBe(false);
  });

  it('should implicitly remove edges when node is deleted', () => {
    const nodeId1 = createNodeId();
    const nodeId2 = createNodeId();
    const edgeId = createEdgeId();

    const events: GraphEvent[] = [
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId1,
        nodeType: asTypeId('test:node'),
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId2,
        nodeType: asTypeId('test:node'),
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: edgeId,
        edgeType: asTypeId('test:edge'),
        source: nodeId1,
        target: nodeId2,
        properties: new Map(),
        timestamp: createInstant(),
      },
      {
        type: 'NodeDeleted',
        eventId: createEventId(),
        id: nodeId1, // Source of the edge
        timestamp: createInstant(),
      },
    ];

    const graph = unwrap(projectGraph(events));
    expect(graph.nodes.has(nodeId1)).toBe(false);
    expect(graph.edges.has(edgeId)).toBe(false); // Should be removed
  });
});
