import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { unwrap } from '@canopy/graph';
import { createGraphRegistry } from './graph-registry';
import type { GraphRegistry, GraphRegistryEntry } from './graph-registry';
import 'fake-indexeddb/auto';

describe('GraphRegistry', () => {
  const entry: GraphRegistryEntry = {
    id: 'graph-1',
    name: 'Test Graph',
    createdAt: '2026-07-05T00:00:00Z',
    updatedAt: '2026-07-05T00:00:00Z',
  };

  let registry: GraphRegistry;

  beforeEach(async () => {
    registry = createGraphRegistry(`test-registry-${Math.random()}`);
    await unwrap(await registry.init());
  });

  afterEach(async () => {
    await unwrap(await registry.close());
  });

  it('starts empty', async () => {
    const list = unwrap(await registry.list());
    expect(list).toEqual([]);
  });

  it('upserts and lists an entry', async () => {
    await unwrap(await registry.upsert(entry));
    const list = unwrap(await registry.list());
    expect(list).toEqual([entry]);
  });

  it('upsert replaces an existing entry with the same id', async () => {
    await unwrap(await registry.upsert(entry));
    const updated: GraphRegistryEntry = {
      ...entry,
      name: 'Renamed',
      updatedAt: '2026-07-05T01:00:00Z',
    };
    await unwrap(await registry.upsert(updated));

    const list = unwrap(await registry.list());
    expect(list).toEqual([updated]);
  });

  it('deletes an entry', async () => {
    await unwrap(await registry.upsert(entry));
    await unwrap(await registry.delete(entry.id));

    const list = unwrap(await registry.list());
    expect(list).toEqual([]);
  });
});
