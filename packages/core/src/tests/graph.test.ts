import { describe, it, expect } from 'vitest';
import {
  createGraph,
  addNode,
  updateNode,
  removeNode,
  addEdge,
  updateEdge,
  removeEdge,
  getNode,
  getEdge,
  getNodesByType,
  getEdgesFrom,
  getEdgesTo,
} from '../index';
import {
  createNodeId,
  createEdgeId,
  asTypeId,
  createGraphId,
  createInstant,
  unwrap,
} from '@canopy/types';
import type { Node, Edge } from '@canopy/types';

describe('Core Graph Engine', () => {
  const graphId = createGraphId();
  const emptyGraph = unwrap(createGraph(graphId, 'Test Graph'));

  it('should create a graph with bootstrap nodes', () => {
    expect(emptyGraph.id).toBe(graphId);
    expect(emptyGraph.name).toBe('Test Graph');
    // Bootstrap adds system nodes (NodeTypes, EdgeTypes, Queries, Views)
    // 7 original + 8 new (ViewDef, TemplateDef, 3 Queries, 3 Views) = 15
    expect(emptyGraph.nodes.size).toBe(15);
    expect(emptyGraph.edges.size).toBe(0);
  });

  const nodeId1 = createNodeId();
  const node1: Node = {
    id: nodeId1,
    type: asTypeId('person'),
    properties: new Map(),
    metadata: { created: createInstant(), modified: createInstant() },
  };

  const nodeId2 = createNodeId();
  const node2: Node = {
    id: nodeId2,
    type: asTypeId('person'),
    properties: new Map(),
    metadata: { created: createInstant(), modified: createInstant() },
  };

  it('should add nodes immutably and emit events', () => {
    const r1 = unwrap(addNode(emptyGraph, node1));
    const g1 = r1.graph;
    expect(g1.nodes.size).toBe(16); // 15 bootstrap + 1 new
    expect(g1.nodes.get(nodeId1)).toBe(node1);
    expect(emptyGraph.nodes.size).toBe(15); // Original unmodified (bootstrap nodes)

    expect(r1.events).toHaveLength(1);
    expect(r1.events[0]).toMatchObject({
      type: 'NODE_CREATED',
      node: node1,
    });

    const r2 = unwrap(addNode(g1, node2));
    const g2 = r2.graph;
    expect(g2.nodes.size).toBe(17); // 15 bootstrap + 2 new
    expect(g2.nodes.get(nodeId2)).toBe(node2);
    expect(g1.nodes.size).toBe(16); // Previous version unmodified

    expect(r2.events).toHaveLength(1);
    expect(r2.events[0]).toMatchObject({
      type: 'NODE_CREATED',
      node: node2,
    });
  });

  it('should update nodes immutably and emit events', () => {
    const r1 = unwrap(addNode(emptyGraph, node1));
    const g1 = r1.graph;
    const r2 = unwrap(
      updateNode(g1, nodeId1, (n) => ({
        ...n,
        properties: new Map([['name', { kind: 'text', value: 'Alice' }]]),
      })),
    );
    const g2 = r2.graph;

    expect(g2.nodes.get(nodeId1)?.properties.get('name')).toEqual({ kind: 'text', value: 'Alice' });
    expect(g1.nodes.get(nodeId1)?.properties.size).toBe(0); // Original unmodified

    // Metadata modified should be updated
    expect(g2.nodes.get(nodeId1)?.metadata.modified).not.toBe(
      g1.nodes.get(nodeId1)?.metadata.modified,
    );

    expect(r2.events).toHaveLength(1);
    const event = r2.events[0];
    expect(event).toBeDefined();
    if (!event) throw new Error('Event missing');

    expect(event.type).toBe('NODE_UPDATED');
    if (event.type === 'NODE_UPDATED') {
      expect(event.nodeId).toBe(nodeId1);
      expect(event.changes.properties?.get('name')).toEqual({ kind: 'text', value: 'Alice' });
    }
  });

  it('should remove nodes and connected edges and emit events', () => {
    let r = unwrap(addNode(emptyGraph, node1));
    let g = r.graph;
    r = unwrap(addNode(g, node2));
    g = r.graph;

    const edgeId = createEdgeId();
    const edge: Edge = {
      id: edgeId,
      source: nodeId1,
      target: nodeId2,
      type: asTypeId('knows'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };

    const re = unwrap(addEdge(g, edge));
    g = re.graph;
    expect(g.edges.size).toBe(1);

    const rRemoved = unwrap(removeNode(g, nodeId1));
    const gRemoved = rRemoved.graph;
    expect(gRemoved.nodes.size).toBe(16); // 15 bootstrap + 1 remaining node
    expect(gRemoved.nodes.has(nodeId1)).toBe(false);
    expect(gRemoved.edges.size).toBe(0); // Edge should be removed

    expect(g.nodes.size).toBe(17); // 15 bootstrap + 2 nodes
    expect(g.edges.size).toBe(1);

    // Verify events: 1 node deleted, 1 edge deleted
    expect(rRemoved.events).toHaveLength(2);
    expect(rRemoved.events).toEqual(
      expect.arrayContaining([
        { type: 'NODE_DELETED', nodeId: nodeId1 },
        { type: 'EDGE_DELETED', edgeId: edgeId },
      ]),
    );
  });

  it('should query nodes and edges', () => {
    let r = unwrap(addNode(emptyGraph, node1));
    let g = r.graph;
    r = unwrap(addNode(g, node2));
    g = r.graph;

    const edgeId = createEdgeId();
    const edge: Edge = {
      id: edgeId,
      source: nodeId1,
      target: nodeId2,
      type: asTypeId('knows'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    const re = unwrap(addEdge(g, edge));
    g = re.graph;

    expect(getNode(g, nodeId1)).toBe(node1);
    expect(getEdge(g, edgeId)).toBe(edge);

    // getNodesByType should find the 2 people we added.
    // It should NOT find bootstrap nodes unless they have type 'person' (which they don't).
    const people = getNodesByType(g, asTypeId('person'));
    expect(people).toHaveLength(2);
    expect(people.map((p) => p.id)).toContain(nodeId1);
    expect(people.map((p) => p.id)).toContain(nodeId2);

    expect(getEdgesFrom(g, nodeId1)).toHaveLength(1);
    expect(getEdgesTo(g, nodeId2)).toHaveLength(1);
    expect(getEdgesTo(g, nodeId1)).toHaveLength(0);
  });

  it('should update edges immutably and emit events', () => {
    let r = unwrap(addNode(emptyGraph, node1));
    let g = r.graph;
    r = unwrap(addNode(g, node2));
    g = r.graph;

    const edgeId = createEdgeId();
    const edge: Edge = {
      id: edgeId,
      source: nodeId1,
      target: nodeId2,
      type: asTypeId('knows'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    const re = unwrap(addEdge(g, edge));
    g = re.graph;

    const rUpdated = unwrap(
      updateEdge(g, edgeId, (e) => ({
        ...e,
        properties: new Map([['since', { kind: 'number', value: 2023 }]]),
      })),
    );
    const gUpdated = rUpdated.graph;

    expect(gUpdated.edges.get(edgeId)?.properties.get('since')).toEqual({
      kind: 'number',
      value: 2023,
    });
    expect(g.edges.get(edgeId)?.properties.size).toBe(0); // Original unmodified

    expect(rUpdated.events).toHaveLength(1);
    const event = rUpdated.events[0];
    expect(event).toBeDefined();
    if (!event) throw new Error('Event missing');

    expect(event.type).toBe('EDGE_UPDATED');
    if (event.type === 'EDGE_UPDATED') {
      expect(event.edgeId).toBe(edgeId);
      expect(event.changes.properties?.get('since')).toEqual({ kind: 'number', value: 2023 });
    }
  });

  it('should remove edges and emit events', () => {
    let r = unwrap(addNode(emptyGraph, node1));
    let g = r.graph;
    r = unwrap(addNode(g, node2));
    g = r.graph;

    const edgeId = createEdgeId();
    const edge: Edge = {
      id: edgeId,
      source: nodeId1,
      target: nodeId2,
      type: asTypeId('knows'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant() },
    };
    const re = unwrap(addEdge(g, edge));
    g = re.graph;

    const rRemoved = unwrap(removeEdge(g, edgeId));
    const gRemoved = rRemoved.graph;
    expect(gRemoved.edges.size).toBe(0);
    expect(g.edges.size).toBe(1); // Original unmodified

    expect(rRemoved.events).toHaveLength(1);
    expect(rRemoved.events[0]).toMatchObject({
      type: 'EDGE_DELETED',
      edgeId,
    });
  });
});
