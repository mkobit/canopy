import { describe, expect, test } from 'bun:test';
import { createInMemoryEventStore } from '@canopy/storage';
import { seedVaultStore } from './seed-vault';
import { createGraphRegistry } from '@canopy/storage-indexeddb';
import { unwrap } from '@canopy/graph';

describe('seedVaultStore', () => {
  test('populates event log store with demo seed events', async () => {
    const store = createInMemoryEventStore();
    const result = await seedVaultStore(store, { preset: 'demo', seed: 100 });
    expect(result.ok).toBe(true);

    const eventsResult = await store.getEvents('demo-graph');
    expect(eventsResult.ok).toBe(true);
    if (eventsResult.ok) {
      expect(eventsResult.value.length).toBeGreaterThan(0);
    }
  });

  test('populates event log store with custom graphId and registers graph entry', async () => {
    const store = createInMemoryEventStore();
    const registry = createGraphRegistry(`test-seed-reg-${Math.random()}`);
    await unwrap(await registry.init());

    const result = await seedVaultStore(store, {
      preset: 'demo',
      seed: 42,
      graphId: 'custom-seed-graph',
      registry,
    });
    expect(result.ok).toBe(true);

    const eventsResult = await store.getEvents('custom-seed-graph');
    expect(eventsResult.ok).toBe(true);
    if (eventsResult.ok) {
      expect(eventsResult.value.length).toBeGreaterThan(0);
    }

    const listResult = await registry.list();
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.value).toHaveLength(1);
      expect(listResult.value[0]?.id).toBe('custom-seed-graph');
      expect(listResult.value[0]?.name).toBe('Demo Graph');
    }

    await unwrap(await registry.close());
  });

  test('is idempotent when called multiple times on the same store and graphId', async () => {
    const store = createInMemoryEventStore();
    const firstResult = await seedVaultStore(store, { preset: 'demo', seed: 100 });
    expect(firstResult.ok).toBe(true);

    const initialEvents = await store.getEvents('demo-graph');
    expect(initialEvents.ok).toBe(true);
    const initialCount = initialEvents.ok ? initialEvents.value.length : 0;
    expect(initialCount).toBeGreaterThan(0);

    const secondResult = await seedVaultStore(store, { preset: 'demo', seed: 100 });
    expect(secondResult.ok).toBe(true);

    const finalEvents = await store.getEvents('demo-graph');
    expect(finalEvents.ok).toBe(true);
    if (finalEvents.ok) {
      expect(finalEvents.value.length).toBe(initialCount);
    }
  });
});
