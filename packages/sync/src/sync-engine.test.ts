import { describe, it, expect } from 'vitest';
import { SyncEngine } from './sync-engine';
import { createNodeId, asTypeId, PropertyValue, unwrap } from '@canopy/types';
import * as Y from 'yjs';

// Helpers
function getPropertyValue(val: PropertyValue | undefined): unknown {
    if (!val) return undefined;
    if (val.kind === 'text' || val.kind === 'number' || val.kind === 'boolean') {
        return val.value;
    }
    return undefined;
}

describe('SyncEngine', () => {
  it('should initialize with a new document', () => {
    const engine = new SyncEngine();
    expect(engine.doc).toBeDefined();
    expect(engine.store).toBeDefined();
    expect(engine.awareness).toBeDefined();
  });

  it('should allow adding nodes via store', () => {
    const engine = new SyncEngine();
    const nodeId = createNodeId();
    const typeId = asTypeId('test-node');

    unwrap(engine.store.addNode({
      id: nodeId,
      type: typeId,
      properties: new Map([['name', { kind: 'text', value: 'Test Node' }]])
    }));

    const storedNode = engine.store.getNode(nodeId);
    expect(storedNode).toBeDefined();
    expect(getPropertyValue(storedNode?.properties.get('name'))).toBe('Test Node');
  });

  it('should allow adding edges via store', () => {
    const engine = new SyncEngine();
    const n1 = unwrap(engine.store.addNode({ type: asTypeId('n1'), properties: new Map() }));
    const n2 = unwrap(engine.store.addNode({ type: asTypeId('n2'), properties: new Map() }));

    const edge = unwrap(engine.store.addEdge({
      source: n1.id,
      target: n2.id,
      type: asTypeId('e1'),
      properties: new Map()
    }));

    const storedEdge = engine.store.getEdge(edge.id);
    expect(storedEdge).toBeDefined();
    expect(storedEdge?.source).toBe(n1.id);
    expect(storedEdge?.target).toBe(n2.id);
  });

  it('should support snapshot export and import', () => {
    const engine1 = new SyncEngine();
    const n1 = unwrap(engine1.store.addNode({ type: asTypeId('n1'), properties: new Map([['key', { kind: 'text', value: 'val' }]]) }));

    const snapshot = engine1.getSnapshot();

    const engine2 = new SyncEngine();
    engine2.applySnapshot(snapshot);

    const n1_restored = engine2.store.getNode(n1.id);
    expect(n1_restored).toBeDefined();
    expect(getPropertyValue(n1_restored?.properties.get('key'))).toBe('val');
    expect(getPropertyValue(n1_restored?.properties.get('key'))).toBe('val');
  });

  it('should support initial snapshot in constructor', () => {
    const engine1 = new SyncEngine();
    const n1 = unwrap(engine1.store.addNode({ type: asTypeId('n1'), properties: new Map([['key', { kind: 'text', value: 'val' }]]) }));
    const snapshot = engine1.getSnapshot();

    const engine2 = new SyncEngine({ initialSnapshot: snapshot });
    const n1_restored = engine2.store.getNode(n1.id);
    expect(n1_restored).toBeDefined();
    expect(getPropertyValue(n1_restored?.properties.get('key'))).toBe('val');
  });

  it('should handle awareness updates', () => {
    const engine = new SyncEngine();
    const user = { name: 'Alice', cursor: { x: 10, y: 10 } };

    engine.setLocalState(user);

    const states = engine.getAwarenessStates();
    const myClientId = engine.doc.clientID;

    expect(states.get(myClientId)).toEqual(user);
  });

  it('should sync changes between two engines via update events', () => {
      const engine1 = new SyncEngine();
      const engine2 = new SyncEngine();

      // Simulate sync
      engine1.onDocUpdate((update) => {
          Y.applyUpdate(engine2.doc, update);
      });

      engine2.onDocUpdate((update) => {
          Y.applyUpdate(engine1.doc, update);
      });

      const n1 = unwrap(engine1.store.addNode({ type: asTypeId('n1'), properties: new Map([['synced', { kind: 'boolean', value: true }]]) }));

      const n1_on_2 = engine2.store.getNode(n1.id);
      expect(n1_on_2).toBeDefined();
      expect(getPropertyValue(n1_on_2?.properties.get('synced'))).toBe(true);
  });
});
