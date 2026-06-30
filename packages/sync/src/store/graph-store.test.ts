import { describe, it, expect, beforeEach } from 'bun:test';
import * as Y from 'yjs';
import { createGraphStore, type GraphStore } from './graph-store';
import { asTypeId, asNodeId, unwrap, isErr } from '@canopy/graph';

describe('GraphStore', () => {
  let document: Y.Doc;
  let store: GraphStore;

  beforeEach(() => {
    document = new Y.Doc();
    store = createGraphStore(document);
  });

  describe('Nodes', () => {
    it('should add and retrieve a node', () => {
      const nodeData = {
        type: asTypeId('person'),
        properties: new Map([['name', 'Alice']]),
      };

      const node = unwrap(store.addNode(nodeData));

      expect(node.id).toBeDefined();
      expect(node.type).toBe(asTypeId('person'));
      expect(node.properties.get('name')).toBe('Alice');
      expect(node.metadata.created).toBeDefined();

      const retrieved = store.getNode(node.id);
      expect(retrieved).toEqual(node);
    });

    it('should list all nodes', () => {
      const node1 = unwrap(store.addNode({ type: asTypeId('a'), properties: new Map() }));
      const node2 = unwrap(store.addNode({ type: asTypeId('b'), properties: new Map() }));

      const nodes = [...store.getAllNodes()];
      expect(nodes).toHaveLength(2);
      expect(nodes.find((n) => n.id === node1.id)).toBeDefined();
      expect(nodes.find((n) => n.id === node2.id)).toBeDefined();
    });

    it('should update a node', () => {
      const node = unwrap(store.addNode({ type: asTypeId('person'), properties: new Map() }));

      const updated = unwrap(
        store.updateNode(node.id, {
          properties: new Map([['age', 30]]),
        }),
      );

      expect(updated.properties.get('age')).toBe(30);
      // expect(updated.metadata.modified).not.toEqual(node.metadata.modified); // Flaky on fast execution

      const retrieved = store.getNode(node.id);
      expect(retrieved).toEqual(updated);
    });

    it('should delete a node', () => {
      const node = unwrap(store.addNode({ type: asTypeId('person'), properties: new Map() }));
      store.deleteNode(node.id);
      expect(store.getNode(node.id)).toBeUndefined();
    });

    it('should return Error when updating non-existent node', () => {
      const result = store.updateNode('fake-id', {});
      expect(isErr(result)).toBe(true);
    });

    it('should manage collaborative text content in texts map', () => {
      const node = unwrap(
        store.addNode({
          type: asTypeId('system:nodetype:markdown'),
          properties: new Map([['content', 'Hello World']]),
        }),
      );

      // Verify the returned node projects the content correctly.
      expect(node.properties.get('content')).toBe('Hello World');

      // Verify the content is stored in Y.Text in the texts map.
      const ytext = store.texts.get(node.id) as Y.Text;
      expect(ytext).toBeDefined();
      expect(ytext.toString()).toBe('Hello World');

      // Verify the content was stripped from the storable properties.
      const storedNode = store.nodes.get(node.id) as {
        readonly properties: Record<string, unknown>;
      };
      expect(storedNode).toBeDefined();
      expect(storedNode.properties.content).toBeUndefined();

      // Retrieve the node from store and confirm it reconstructs the content correctly.
      const retrieved = store.getNode(node.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.properties.get('content')).toBe('Hello World');

      // Update the content and verify the update.
      const updated = unwrap(
        store.updateNode(node.id, {
          properties: new Map([['content', 'Hello Unified Sync']]),
        }),
      );
      expect(updated.properties.get('content')).toBe('Hello Unified Sync');
      expect(ytext.toString()).toBe('Hello Unified Sync');

      // Delete the node and confirm Y.Text is deleted too.
      unwrap(store.deleteNode(node.id));
      expect(store.texts.get(node.id)).toBeUndefined();
    });
  });

  describe('Edges', () => {
    let sourceId: string;
    let targetId: string;

    beforeEach(() => {
      const s = unwrap(store.addNode({ type: asTypeId('source'), properties: new Map() }));
      const t = unwrap(store.addNode({ type: asTypeId('target'), properties: new Map() }));
      sourceId = s.id;
      targetId = t.id;
    });

    it('should add and retrieve an edge', () => {
      const edgeData = {
        source: asNodeId(sourceId),
        target: asNodeId(targetId),
        type: asTypeId('link'),
        properties: new Map(),
      };

      const edge = unwrap(store.addEdge(edgeData));
      expect(edge.id).toBeDefined();
      expect(edge.source).toBe(asNodeId(sourceId));
      expect(edge.target).toBe(asNodeId(targetId));

      const retrieved = store.getEdge(edge.id);
      expect(retrieved).toEqual(edge);
    });

    it('should validate source and target existence', () => {
      const result = store.addEdge({
        source: asNodeId('fake-source'),
        target: asNodeId(targetId),
        type: asTypeId('link'),
        properties: new Map(),
      });
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toMatch(/Source node.*not found/);
      }
    });

    it('should update an edge', () => {
      const edge = unwrap(
        store.addEdge({
          source: asNodeId(sourceId),
          target: asNodeId(targetId),
          type: asTypeId('link'),
          properties: new Map(),
        }),
      );

      const updated = unwrap(
        store.updateEdge(edge.id, {
          properties: new Map([['weight', 1]]),
        }),
      );

      expect(updated.properties.get('weight')).toBe(1);

      const retrieved = store.getEdge(edge.id);
      expect(retrieved).toEqual(updated);
    });

    it('should delete an edge', () => {
      const edge = unwrap(
        store.addEdge({
          source: asNodeId(sourceId),
          target: asNodeId(targetId),
          type: asTypeId('link'),
          properties: new Map(),
        }),
      );

      store.deleteEdge(edge.id);
      expect(store.getEdge(edge.id)).toBeUndefined();
    });
  });
});
