import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteAdapter } from './sqlite-adapter';
import { IndexedDBAdapter } from './indexeddb-adapter';
import { GraphStorageMetadata } from './types';
import { unwrap } from '@canopy/types';
import 'fake-indexeddb/auto';

// Mock data
const mockGraphId = 'test-graph-id';
const mockSnapshot = new Uint8Array([1, 2, 3, 4, 5]);
const mockMetadata: GraphStorageMetadata = {
  id: mockGraphId,
  name: 'Test Graph',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('SQLiteAdapter', () => {
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    adapter = new SQLiteAdapter(); // In-memory
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(list[0]!.name).toEqual(mockMetadata.name);
  });

  it('should delete a graph', async () => {
    await unwrap(await adapter.save(mockGraphId, mockSnapshot, mockMetadata));
    await unwrap(await adapter.delete(mockGraphId));
    const loaded = unwrap(await adapter.load(mockGraphId));
    expect(loaded).toBeNull();
    const list = unwrap(await adapter.list());
    expect(list).toHaveLength(0);
  });

  it('should persist data if persistence layer provided', async () => {
    let storedData: Uint8Array | null = null;
    const persistence = {
      read: async () => storedData,
      write: async (data: Uint8Array) => {
        storedData = data;
      },
    };

    const persistAdapter = new SQLiteAdapter(persistence);
    await unwrap(await persistAdapter.init());
    await unwrap(await persistAdapter.save(mockGraphId, mockSnapshot, mockMetadata));
    await unwrap(await persistAdapter.close());

    expect(storedData).not.toBeNull();

    // Re-open with data
    const newAdapter = new SQLiteAdapter(persistence);
    await unwrap(await newAdapter.init());
    const loaded = unwrap(await newAdapter.load(mockGraphId));
    expect(loaded).toEqual(mockSnapshot);
    await unwrap(await newAdapter.close());
  });
});

describe('IndexedDBAdapter', () => {
  let adapter: IndexedDBAdapter;

  beforeEach(async () => {
    adapter = new IndexedDBAdapter('test-db-' + Math.random());
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
