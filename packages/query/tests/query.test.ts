import { describe, it, expect, beforeEach } from 'vitest';
import { GraphQuery } from '../src/index.js';
import { Graph, Node, Edge, createNodeId, createEdgeId, asTypeId, createGraphId, createInstant } from '@canopy/types';

// Mock graph creation helper (since we removed dependency on Core's implementation here)
// Ideally we would depend on @canopy/core to create graph but we want to avoid circular deps if query is low level
// Or just replicate the simple struct for tests
function createMockGraph(): Graph {
    return {
        id: createGraphId(),
        name: 'test',
        metadata: { created: createInstant(), modified: createInstant() },
        nodes: new Map(),
        edges: new Map()
    };
}

describe('GraphQuery', () => {
  let graph: Graph;
  let query: GraphQuery;

  beforeEach(() => {
    graph = createMockGraph();
    query = new GraphQuery(graph);
  });

  it('should find nodes by type', () => {
    const aliceId = createNodeId();
    const bobId = createNodeId();
    const proj1Id = createNodeId();
    const proj2Id = createNodeId();

    const now = createInstant();
    const meta = { created: now, modified: now };

    // Manually populate graph
    (graph.nodes as Map<string, Node>).set(aliceId, { id: aliceId, type: asTypeId('Person'), properties: new Map(), metadata: meta });
    (graph.nodes as Map<string, Node>).set(bobId, { id: bobId, type: asTypeId('Person'), properties: new Map(), metadata: meta });
    (graph.nodes as Map<string, Node>).set(proj1Id, { id: proj1Id, type: asTypeId('Project'), properties: new Map(), metadata: meta });
    (graph.nodes as Map<string, Node>).set(proj2Id, { id: proj2Id, type: asTypeId('Project'), properties: new Map(), metadata: meta });

    const people = query.findNodes(asTypeId('Person'));
    expect(people).toHaveLength(2);
    expect(people.map(n => n.id)).toContain(aliceId);
    expect(people.map(n => n.id)).toContain(bobId);
  });

  it('should find edges by type', () => {
      const aliceId = createNodeId();
      const proj1Id = createNodeId();
      const now = createInstant();
      const meta = { created: now, modified: now };

      (graph.nodes as Map<string, Node>).set(aliceId, { id: aliceId, type: asTypeId('Person'), properties: new Map(), metadata: meta });
      (graph.nodes as Map<string, Node>).set(proj1Id, { id: proj1Id, type: asTypeId('Project'), properties: new Map(), metadata: meta });

      const edge1Id = createEdgeId();
      const edge2Id = createEdgeId();

      (graph.edges as Map<string, Edge>).set(edge1Id, {
          id: edge1Id,
          source: aliceId,
          target: proj1Id,
          type: asTypeId('ATTENDED'),
          properties: new Map(),
          metadata: meta
      });

       (graph.edges as Map<string, Edge>).set(edge2Id, {
          id: edge2Id,
          source: proj1Id,
          target: aliceId,
          type: asTypeId('ATTENDED'),
          properties: new Map(),
          metadata: meta
      });

      const attended = query.findEdges(asTypeId('ATTENDED'));
      expect(attended).toHaveLength(2);
  });
});
