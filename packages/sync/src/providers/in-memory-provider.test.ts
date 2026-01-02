import { describe, it, expect } from 'vitest';
import { SyncEngine } from '../sync-engine.js';
import { InMemoryProvider } from './in-memory-provider.js';
import { asTypeId } from '@canopy/types';

describe('InMemoryProvider', () => {
  it('should sync changes between two engines using InMemoryProvider', () => {
    const engine1 = new SyncEngine();
    const engine2 = new SyncEngine();

    const provider1 = new InMemoryProvider('room1', engine1.doc, engine1.awareness);
    const provider2 = new InMemoryProvider('room1', engine2.doc, engine2.awareness);

    engine1.setProvider(provider1);
    engine2.setProvider(provider2);

    // Make a change in engine1
    const n1 = engine1.store.addNode({ type: asTypeId('n1'), properties: new Map([['synced', { kind: 'boolean', value: true }]]) });

    // Expect change in engine2
    const n1_on_2 = engine2.store.getNode(n1.id);
    expect(n1_on_2).toBeDefined();
    expect((n1_on_2?.properties.get('synced') as { kind: string; value: boolean }).value).toBe(true);

    // Disconnect
    engine1.disconnectProvider();
    engine2.disconnectProvider();
  });

  it('should sync awareness states', () => {
    const engine1 = new SyncEngine();
    const engine2 = new SyncEngine();

    const provider1 = new InMemoryProvider('room_awareness', engine1.doc, engine1.awareness);
    const provider2 = new InMemoryProvider('room_awareness', engine2.doc, engine2.awareness);

    engine1.setProvider(provider1);
    engine2.setProvider(provider2);

    const user1 = { name: 'User 1' };
    engine1.setLocalState(user1);

    // Check if engine2 received the state
    const states = engine2.getAwarenessStates();
    expect(states.size).toBeGreaterThan(0);

    // We need to find the state corresponding to engine1's client ID
    const engine1ClientId = engine1.doc.clientID;
    expect(states.get(engine1ClientId)).toEqual(user1);

    engine1.disconnectProvider();
    engine2.disconnectProvider();
  });
});
