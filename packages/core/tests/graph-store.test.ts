import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../src/store/graph-store';
import * as Y from 'yjs';
import { asTypeId } from '@canopy/types';

describe('GraphStore', () => {
  let doc: Y.Doc;
  let store: GraphStore;

  beforeEach(() => {
    doc = new Y.Doc();
    store = new GraphStore(doc);
  });

  it('can create a node type', () => {
    // Note: In the new architecture, NodeType is just a Node with type="NodeType"
    // and specific properties.
    const personType = store.addNode({
      type: asTypeId('NodeType'),
      properties: new Map([
        ['name', { kind: 'text', value: 'Person' }],
      ]),
    });

    expect(personType.id).toBeDefined();
    expect(personType.type).toBe('NodeType');

    const fetched = store.getNode(personType.id);
    expect(fetched).toEqual(personType);
  });

  it('can create a typed node', () => {
    // Create Node
    const alice = store.addNode({
      type: asTypeId('Person'),
      properties: new Map([
          ['name', { kind: 'text', value: 'Alice' }],
          ['age', { kind: 'number', value: 30 }]
      ]),
    });

    expect(alice.type).toBe('Person');
    expect(alice.properties.get('name')).toEqual({ kind: 'text', value: 'Alice' });
  });

  it('syncs between two stores', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();

      const store1 = new GraphStore(doc1);
      const store2 = new GraphStore(doc2);

      doc1.on('update', (update) => {
          Y.applyUpdate(doc2, update);
      });
      doc2.on('update', (update) => {
          Y.applyUpdate(doc1, update);
      });

      // Create node in store1
      const created = store1.addNode({
          type: asTypeId('Note'),
          properties: new Map([
              ['content', { kind: 'text', value: 'Hello World' }]
          ])
      });

      // Check store2
      // Use public API to access nodes, which handles deserialization
      const node2 = store2.getNode(created.id);

      expect(node2).toBeDefined();
      expect(node2?.type).toBe('Note');
      expect(node2?.properties.get('content')).toEqual({ kind: 'text', value: 'Hello World' });
  });
});
