import { describe, it, expect, beforeEach } from 'vitest';
import { GraphStore } from '../src/store/graph-store';
import * as Y from 'yjs';

describe('GraphStore', () => {
  let doc: Y.Doc;
  let store: GraphStore;

  beforeEach(() => {
    doc = new Y.Doc();
    store = new GraphStore(doc);

    // Bootstrap NodeType
    // Note: In my implementation, I assume NodeType itself is a type that is "built-in" effectively
    // because I skip validation for type="NodeType".
    // But for other types like "Person", I need to create the NodeType definition first.
  });

  it('can create a node type', () => {
    const personType = store.addNode({
      type: 'NodeType',
      properties: {
        name: 'Person',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'age', type: 'number' },
        ],
      },
    });

    expect(personType.id).toBeDefined();
    expect(personType.type).toBe('NodeType');

    const fetched = store.getNode(personType.id);
    expect(fetched).toEqual(personType);
  });

  it('can create a typed node', () => {
    // Define Type
    store.addNode({
      type: 'NodeType',
      properties: {
        name: 'Person',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'age', type: 'number' },
        ],
      },
    });

    // Create Node
    const alice = store.addNode({
      type: 'Person',
      properties: { name: 'Alice', age: 30 },
    });

    expect(alice.type).toBe('Person');
    expect(alice.properties.name).toBe('Alice');
  });

  it('validates required properties', () => {
     store.addNode({
      type: 'NodeType',
      properties: {
        name: 'Person',
        properties: [
          { name: 'name', type: 'string', required: true },
        ],
      },
    });

    expect(() => {
      store.addNode({
        type: 'Person',
        properties: { age: 30 }, // Missing name
      });
    }).toThrow('Missing required property: name');
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

      // Define type in store1
      store1.addNode({
          type: 'NodeType',
          properties: {
              name: 'Note',
              properties: [{ name: 'content', type: 'string' }]
          }
      });

      // Create node in store1
      store1.addNode({
          type: 'Note',
          properties: { content: 'Hello World' }
      });

      // Wait for sync? Yjs sync is synchronous when applying updates in-memory like this usually,
      // but let's verify.

      // Check store2
      // We need to iterate as we don't know the ID
      const nodes2 = Array.from(store2.nodes.values());
      expect(nodes2.length).toBe(2); // NodeType + Note
      const note = nodes2.find(n => n.type === 'Note');
      expect(note).toBeDefined();
      expect(note?.properties.content).toBe('Hello World');
  });
});
