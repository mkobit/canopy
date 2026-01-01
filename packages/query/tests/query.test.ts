import { describe, it, expect, beforeEach } from 'vitest';
import { GraphQuery } from '../src/index.js';
import { GraphStore } from '@canopy/core';
import * as Y from 'yjs';
import { createNodeId, createEdgeId, asTypeId } from '@canopy/types';

describe('GraphQuery', () => {
  let doc: Y.Doc;
  let store: GraphStore;
  let query: GraphQuery;

  beforeEach(() => {
    doc = new Y.Doc();
    store = new GraphStore(doc);
    query = new GraphQuery(store);
  });

  it('should find nodes by type', () => {
    const aliceId = createNodeId();
    const bobId = createNodeId();
    const proj1Id = createNodeId();
    const proj2Id = createNodeId();

    store.addNode({ id: aliceId, type: asTypeId('Person'), properties: new Map() });
    store.addNode({ id: bobId, type: asTypeId('Person'), properties: new Map() });
    store.addNode({ id: proj1Id, type: asTypeId('Project'), properties: new Map() });
    store.addNode({ id: proj2Id, type: asTypeId('Project'), properties: new Map() });

    const people = query.findNodes(asTypeId('Person'));
    expect(people).toHaveLength(2);
    expect(people.map(n => n.id)).toContain(aliceId);
    expect(people.map(n => n.id)).toContain(bobId);
  });

  it('should find edges by type', () => {
      const aliceId = createNodeId();
      const proj1Id = createNodeId();
      store.addNode({ id: aliceId, type: asTypeId('Person'), properties: new Map() });
      store.addNode({ id: proj1Id, type: asTypeId('Project'), properties: new Map() });

      const edge1Id = createEdgeId();
      const edge2Id = createEdgeId();

      store.addEdge({
          id: edge1Id,
          source: aliceId,
          target: proj1Id,
          type: asTypeId('ATTENDED'),
          properties: new Map()
      });

      store.addEdge({
          id: edge2Id,
          source: proj1Id,
          target: aliceId,
          type: asTypeId('ATTENDED'),
          properties: new Map()
      });

      const attended = query.findEdges(asTypeId('ATTENDED'));
      expect(attended).toHaveLength(2);
  });
});
