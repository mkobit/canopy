import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../src/store/graph-store.js';
import * as Y from 'yjs';
import { NodeId, TypeId, EdgeId, PropertyValue, asTypeId } from '@canopy/types';

describe('GraphStore', () => {
  let doc: Y.Doc;
  let store: GraphStore;

  beforeEach(() => {
    doc = new Y.Doc();
    store = new GraphStore(doc);
  });

  it('should add and retrieve a node', () => {
    const node = store.addNode({
      type: asTypeId('NodeType'),
      properties: new Map<string, PropertyValue>([['name', { kind: 'text', value: 'Test Node' }]]),
    });

    const retrieved = store.getNode(node.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(node.id);
    expect(retrieved?.type).toBe('NodeType');
    expect(retrieved?.properties.get('name')).toEqual({ kind: 'text', value: 'Test Node' });
  });

  it('should add and retrieve an edge', () => {
    const source = store.addNode({
      type: asTypeId('Person'),
      properties: new Map(),
    });
    const target = store.addNode({
      type: asTypeId('Person'),
      properties: new Map(),
    });

    const edge = store.addEdge({
      source: source.id,
      target: target.id,
      type: asTypeId('KNOWS'),
      properties: new Map([['since', { kind: 'number', value: 2023 }]]),
    });

    const retrieved = store.getEdge(edge.id);
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe(edge.id);
    expect(retrieved?.source).toBe(source.id);
    expect(retrieved?.target).toBe(target.id);
    expect(retrieved?.properties.get('since')).toEqual({ kind: 'number', value: 2023 });
  });

  it('should update a node', () => {
    const node = store.addNode({
      type: asTypeId('Person'),
      properties: new Map([['name', { kind: 'text', value: 'Alice' }]]),
    });

    store.updateNode(node.id, {
      properties: new Map([['name', { kind: 'text', value: 'Alice Smith' }]]),
    });

    const updated = store.getNode(node.id);
    expect(updated?.properties.get('name')).toEqual({ kind: 'text', value: 'Alice Smith' });
  });

  it('should throw when updating non-existent node', () => {
      expect(() => {
          store.updateNode('non-existent', {});
      }).toThrow();
  });

  it('should delete a node', () => {
      const node = store.addNode({
          type: asTypeId('Note'),
          properties: new Map(),
      });

      store.deleteNode(node.id);
      expect(store.getNode(node.id)).toBeUndefined();
  });

  it('should throw when deleting non-existent node', () => {
      expect(() => {
          store.deleteNode('non-existent');
      }).toThrow();
  });
});
