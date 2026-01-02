import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from './sqlite-adapter.js';
import { IndexedDBAdapter } from './indexeddb-adapter.js';
import { GraphStorageMetadata } from './types.js';
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
    await adapter.save(mockGraphId, mockSnapshot, mockMetadata);
    const loaded = await adapter.load(mockGraphId);
    expect(loaded).toEqual(mockSnapshot);
  });

  it('should return null for non-existent graph', async () => {
    const loaded = await adapter.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should list graphs', async () => {
    await adapter.save(mockGraphId, mockSnapshot, mockMetadata);
    const list = await adapter.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toEqual(mockGraphId);
    expect(list[0].name).toEqual(mockMetadata.name);
  });

  it('should delete a graph', async () => {
    await adapter.save(mockGraphId, mockSnapshot, mockMetadata);
    await adapter.delete(mockGraphId);
    const loaded = await adapter.load(mockGraphId);
    expect(loaded).toBeNull();
    const list = await adapter.list();
    expect(list).toHaveLength(0);
  });

  it('should persist data if persistence layer provided', async () => {
    let storedData: Uint8Array | null = null;
    const persistence = {
      read: async () => storedData,
      write: async (data: Uint8Array) => { storedData = data; }
    };

    const persistAdapter = new SQLiteAdapter(persistence);
    await persistAdapter.init();
    await persistAdapter.save(mockGraphId, mockSnapshot, mockMetadata);
    await persistAdapter.close();

    expect(storedData).not.toBeNull();

    // Re-open with data
    const newAdapter = new SQLiteAdapter(persistence);
    await newAdapter.init();
    const loaded = await newAdapter.load(mockGraphId);
    expect(loaded).toEqual(mockSnapshot);
    await newAdapter.close();
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
    await adapter.save(mockGraphId, mockSnapshot, mockMetadata);
    const loaded = await adapter.load(mockGraphId);
    expect(loaded).toEqual(mockSnapshot);
  });

  it('should return null for non-existent graph', async () => {
    const loaded = await adapter.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should list graphs', async () => {
    await adapter.save(mockGraphId, mockSnapshot, mockMetadata);
    const list = await adapter.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toEqual(mockGraphId);
  });

  it('should delete a graph', async () => {
    await adapter.save(mockGraphId, mockSnapshot, mockMetadata);
    await adapter.delete(mockGraphId);
    const loaded = await adapter.load(mockGraphId);
    expect(loaded).toBeNull();
  });
});
