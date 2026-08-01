import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSQLiteEventLog } from './sqlite-event-log';
import type { SQLiteEventLog } from './sqlite-event-log';
import {
  asNodeId,
  asTypeId,
  asEventId,
  asInstant,
  asDeviceId,
  createGraphSession,
  asGraphId,
  SYSTEM_DEVICE_ID,
} from '@canopy/graph';
import type { NodeCreated, NodePropertiesUpdated, GraphEvent } from '@canopy/graph';

const TEST_GRAPH_ID = asGraphId('bench-sqlite-graph');

const generateStorageEvents = (count: number): readonly GraphEvent[] => {
  const events: GraphEvent[] = [];
  const half = Math.floor(count / 2);

  // First half: NodeCreated events
  for (let index = 0; index < half; index++) {
    const hexIndex = index.toString(16).padStart(12, '0');
    const eventId = asEventId(`018f0000-${hexIndex.slice(0, 4)}-7000-8000-${hexIndex.slice(4)}`);
    const nodeEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId,
      id: asNodeId(`node-${index}`),
      nodeType: asTypeId('document'),
      properties: new Map([
        ['title', `Document ${index}`],
        ['index', String(index)],
      ]),
      timestamp: asInstant('2025-01-01T00:00:00.000Z'),
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    };
    events.push(nodeEvent);
  }

  // Second half: NodePropertiesUpdated events
  for (let index = half; index < count; index++) {
    const targetNodeIndex = index - half;
    const hexIndex = index.toString(16).padStart(12, '0');
    const eventId = asEventId(`018f0000-${hexIndex.slice(0, 4)}-7000-8000-${hexIndex.slice(4)}`);
    const updateEvent: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId,
      id: asNodeId(`node-${targetNodeIndex}`),
      changes: new Map([['status', 'archived']]),
      timestamp: asInstant('2025-01-01T01:00:00.000Z'),
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    };
    events.push(updateEvent);
  }

  return events;
};

describe('SQLiteEventLog Replay Load Test (50k events)', () => {
  let store: SQLiteEventLog;

  beforeEach(async () => {
    store = createSQLiteEventLog();
    await store.init();
  });

  afterEach(async () => {
    await store.close();
  });

  it('benchmarks batch appending 50k events into SQLite persistence in chunks', async () => {
    const totalEvents = 50_000;
    const chunkSize = 5000;
    const allEvents = generateStorageEvents(totalEvents);

    const startAppend = performance.now();
    for (let offset = 0; offset < totalEvents; offset += chunkSize) {
      const chunk = allEvents.slice(offset, offset + chunkSize);
      const appendResult = await store.appendEvents(TEST_GRAPH_ID, chunk);
      expect(appendResult.ok).toBe(true);
    }
    const durationAppend = performance.now() - startAppend;

    expect(durationAppend).toBeLessThan(10_000);
  }, 40_000);

  it('benchmarks full 50k event replay retrieval from SQLite event log store', async () => {
    const totalEvents = 50_000;
    const chunkSize = 10_000;
    const allEvents = generateStorageEvents(totalEvents);

    // Seed events
    for (let offset = 0; offset < totalEvents; offset += chunkSize) {
      const chunk = allEvents.slice(offset, offset + chunkSize);
      await store.appendEvents(TEST_GRAPH_ID, chunk);
    }

    const startReplay = performance.now();
    const replayResult = await store.getEvents(TEST_GRAPH_ID);
    const durationReplay = performance.now() - startReplay;

    expect(replayResult.ok).toBe(true);
    if (replayResult.ok) {
      expect(replayResult.value.length).toBe(totalEvents);
    }

    expect(durationReplay).toBeLessThan(5000);
  }, 40_000);

  it('benchmarks paginated cursor query retrieval over 50k events in SQLite', async () => {
    const totalEvents = 50_000;
    const chunkSize = 10_000;
    const allEvents = generateStorageEvents(totalEvents);

    // Seed events
    for (let offset = 0; offset < totalEvents; offset += chunkSize) {
      const chunk = allEvents.slice(offset, offset + chunkSize);
      await store.appendEvents(TEST_GRAPH_ID, chunk);
    }

    const midEventId = allEvents[25_000]?.eventId;
    if (!midEventId) {
      throw new Error('Expected midEventId');
    }

    const startCursor = performance.now();
    const cursorResult = await store.getEvents(TEST_GRAPH_ID, {
      after: midEventId,
      limit: 500,
    });
    const durationCursor = performance.now() - startCursor;

    expect(cursorResult.ok).toBe(true);
    if (cursorResult.ok) {
      expect(cursorResult.value.length).toBe(500);
    }
    expect(durationCursor).toBeLessThan(100);
  }, 40_000);

  it('benchmarks GraphSession cold-start fold materialization with persistent storage events', async () => {
    const totalEvents = 10_000;
    const chunkSize = 5000;
    const allEvents = generateStorageEvents(totalEvents);

    // Seed storage
    for (let offset = 0; offset < totalEvents; offset += chunkSize) {
      const chunk = allEvents.slice(offset, offset + chunkSize);
      await store.appendEvents(TEST_GRAPH_ID, chunk);
    }

    const session = createGraphSession(store, TEST_GRAPH_ID, SYSTEM_DEVICE_ID);

    const startFold = performance.now();
    const loadResult = await session.load();
    const durationFold = performance.now() - startFold;

    expect(loadResult.ok).toBe(true);
    const projectedGraph = session.graph();
    expect(projectedGraph.nodes.size).toBeGreaterThanOrEqual(5000);
    expect(durationFold).toBeLessThan(10_000);
  }, 30_000);
});
