import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createIndexedDBAdapter } from './indexeddb-adapter';
import type { GraphStorageMetadata, StorageAdapter } from '@canopy/storage';
import { unwrap } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';
import 'fake-indexeddb/auto';

// Mock data
const mockGraphId = 'test-graph-id';
const mockSnapshot = new Uint8Array([1, 2, 3, 4, 5]);
const mockMetadata: GraphStorageMetadata = {
  id: mockGraphId,
  name: 'Test Graph',
  createdAt: Temporal.Now.instant().toString(),
  updatedAt: Temporal.Now.instant().toString(),
};

describe('IndexedDBAdapter', () => {
  let adapter: StorageAdapter;

  beforeEach(async () => {
    adapter = createIndexedDBAdapter('test-db-' + Math.random());
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('should save and load a graph', async () => {
    await unwrap(await adapter.save(mockGraphId, mockSnapshot, mockMetadata));
    const loaded = unwrap(await adapter.load(mockGraphId));
    expect(loaded).toEqual(mockSnapshot);
  });

  it('should return null for non-existent graph', async () => {
    const loaded = unwrap(await adapter.load('non-existent'));
    expect(loaded).toBeNull();
  });

  it('should list graphs', async () => {
    await unwrap(await adapter.save(mockGraphId, mockSnapshot, mockMetadata));
    const list = unwrap(await adapter.list());
    expect(list).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(list[0]!.id).toEqual(mockGraphId);
  });

  it('should delete a graph', async () => {
    await unwrap(await adapter.save(mockGraphId, mockSnapshot, mockMetadata));
    await unwrap(await adapter.delete(mockGraphId));
    const loaded = unwrap(await adapter.load(mockGraphId));
    expect(loaded).toBeNull();
  });
});
