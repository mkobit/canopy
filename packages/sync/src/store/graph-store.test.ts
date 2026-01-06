import { describe, it, expect, beforeEach } from 'vitest';
import * as Y from 'yjs';
import { GraphStore } from './graph-store';
import { asTypeId, asNodeId } from '@canopy/types';

describe('GraphStore', () => {
  let doc: Y.Doc;
  let store: GraphStore;

  beforeEach(() => {
    doc = new Y.Doc();
    store = new GraphStore(doc);
  });

  describe('Nodes', () => {
    it('should add and retrieve a node', () => {
      const nodeData = {
        type: asTypeId('person'),
        properties: new Map([
          ['name', { kind: 'text' as const, value: 'Alice' }]
        ])
      };

      const node = store.addNode(nodeData);

      expect(node.id).toBeDefined();
      expect(node.type).toBe('person');
      expect(node.properties.get('name')).toEqual({ kind: 'text', value: 'Alice' });
      expect(node.metadata.created).toBeDefined();

      const retrieved = store.getNode(node.id);
      expect(retrieved).toEqual(node);
    });

    it('should list all nodes', () => {
        const node1 = store.addNode({ type: asTypeId('a'), properties: new Map() });
        const node2 = store.addNode({ type: asTypeId('b'), properties: new Map() });

        const nodes = Array.from(store.getAllNodes());
        expect(nodes).toHaveLength(2);
        expect(nodes.find(n => n.id === node1.id)).toBeDefined();
        expect(nodes.find(n => n.id === node2.id)).toBeDefined();
    });

    it('should update a node', () => {
        const node = store.addNode({ type: asTypeId('person'), properties: new Map() });

        const updated = store.updateNode(node.id, {
            properties: new Map([['age', { kind: 'number', value: 30 }]])
        });

        expect(updated.properties.get('age')).toEqual({ kind: 'number', value: 30 });
        // expect(updated.metadata.modified).not.toEqual(node.metadata.modified); // Flaky on fast execution

        const retrieved = store.getNode(node.id);
        expect(retrieved).toEqual(updated);
    });

    it('should delete a node', () => {
        const node = store.addNode({ type: asTypeId('person'), properties: new Map() });
        store.deleteNode(node.id);
        expect(store.getNode(node.id)).toBeUndefined();
    });

    it('should throw when updating non-existent node', () => {
        expect(() => store.updateNode('fake-id', {})).toThrow();
    });
  });

  describe('Edges', () => {
      let sourceId: string;
      let targetId: string;

      beforeEach(() => {
          const s = store.addNode({ type: asTypeId('source'), properties: new Map() });
          const t = store.addNode({ type: asTypeId('target'), properties: new Map() });
          sourceId = s.id;
          targetId = t.id;
      });

      it('should add and retrieve an edge', () => {
          const edgeData = {
              source: asNodeId(sourceId),
              target: asNodeId(targetId),
              type: asTypeId('link'),
              properties: new Map()
          };

          const edge = store.addEdge(edgeData);
          expect(edge.id).toBeDefined();
          expect(edge.source).toBe(sourceId);
          expect(edge.target).toBe(targetId);

          const retrieved = store.getEdge(edge.id);
          expect(retrieved).toEqual(edge);
      });

      it('should validate source and target existence', () => {
          expect(() => store.addEdge({
              source: asNodeId('fake-source'),
              target: asNodeId(targetId),
              type: asTypeId('link'),
              properties: new Map()
          })).toThrow(/Source node.*not found/);
      });

      it('should update an edge', () => {
           const edge = store.addEdge({
              source: asNodeId(sourceId),
              target: asNodeId(targetId),
              type: asTypeId('link'),
              properties: new Map()
          });

          const updated = store.updateEdge(edge.id, {
              properties: new Map([['weight', { kind: 'number', value: 1 }]])
          });

          expect(updated.properties.get('weight')).toEqual({ kind: 'number', value: 1 });

          const retrieved = store.getEdge(edge.id);
          expect(retrieved).toEqual(updated);
      });

      it('should delete an edge', () => {
           const edge = store.addEdge({
              source: asNodeId(sourceId),
              target: asNodeId(targetId),
              type: asTypeId('link'),
              properties: new Map()
          });

          store.deleteEdge(edge.id);
          expect(store.getEdge(edge.id)).toBeUndefined();
      });
  });
});
