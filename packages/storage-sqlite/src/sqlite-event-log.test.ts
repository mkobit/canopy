import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSQLiteEventLog } from './sqlite-event-log';
import type { SQLiteEventLog } from './sqlite-event-log';
import {
  unwrap,
  asNodeId,
  asShapeId,
  asEventId,
  asInstant,
  asDeviceId,
  createEdgeId,
} from '@canopy/graph';
import type { NodeCreated, GraphEvent } from '@canopy/graph';

const mockGraphId = 'test-graph-id';

const assertDefined = <T>(value: T | null | undefined): T => {
  if (value === null || value === undefined) {
    throw new Error('Expected value to be defined');
  }
  return value;
};

// Helper to create events
const createEvent = (index: number): NodeCreated => ({
  type: 'NodeCreated',
  eventId: asEventId(`018d9${index.toString().padStart(3, '0')}-0000-7000-8000-000000000000`), // Dummy UUIDv7-ish
  id: asNodeId(`node-${index}`),
  shapeId: asShapeId('test-type'),
  properties: new Map(),
  timestamp: asInstant(
    Temporal.Instant.from(`2024-01-01T10:${String(index).padStart(2, '0')}:00.000Z`).toString(),
  ),
  deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
});

describe('SQLiteEventLog', () => {
  let adapter: SQLiteEventLog;

  beforeEach(async () => {
    adapter = createSQLiteEventLog();
    await adapter.init();
  });

  afterEach(async () => {
    await adapter.close();
  });

  it('should append and get events', async () => {
    const events: GraphEvent[] = [createEvent(1), createEvent(2)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(2);
    expect(assertDefined(result[0]).eventId).toEqual(assertDefined(events[0]).eventId);
    expect(assertDefined(result[1]).eventId).toEqual(assertDefined(events[1]).eventId);
  });

  it('should filter by after (incremental sync)', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    // Get events after event 1
    const result = unwrap(
      await adapter.getEvents(mockGraphId, {
        after: assertDefined(events[0]).eventId,
      }),
    );
    expect(result).toHaveLength(2);
    expect(assertDefined(result[0]).eventId).toEqual(assertDefined(events[1]).eventId);
    expect(assertDefined(result[1]).eventId).toEqual(assertDefined(events[2]).eventId);
  });

  it('should filter by before', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    // Get events before event 3
    const result = unwrap(
      await adapter.getEvents(mockGraphId, {
        before: assertDefined(events[2]).eventId,
      }),
    );
    expect(result).toHaveLength(2);
    expect(assertDefined(result[0]).eventId).toEqual(assertDefined(events[0]).eventId);
    expect(assertDefined(result[1]).eventId).toEqual(assertDefined(events[1]).eventId);
  });

  it('should respect limit', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { limit: 2 }));
    expect(result).toHaveLength(2);
    expect(assertDefined(result[0]).eventId).toEqual(assertDefined(events[0]).eventId);
    expect(assertDefined(result[1]).eventId).toEqual(assertDefined(events[1]).eventId);
  });

  it('should sort reverse', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { reverse: true }));
    expect(result).toHaveLength(3);
    expect(assertDefined(result[0]).eventId).toEqual(assertDefined(events[2]).eventId);
    expect(assertDefined(result[1]).eventId).toEqual(assertDefined(events[1]).eventId);
    expect(assertDefined(result[2]).eventId).toEqual(assertDefined(events[0]).eventId);
  });

  it('should ignore duplicate events', async () => {
    const event = createEvent(1);
    await unwrap(await adapter.appendEvents(mockGraphId, [event]));
    await unwrap(await adapter.appendEvents(mockGraphId, [event])); // Append same event again

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(1);
  });

  it('upcasts legacy nodeType/edgeType and canopy:open sentinel and round-trips open entities', async () => {
    const legacyNode = {
      type: 'NodeCreated',
      eventId: asEventId('018d9001-0000-7000-8000-000000000000'),
      id: asNodeId('node-legacy'),
      nodeType: 'legacy:task',
      properties: new Map([['title', 'Legacy']]),
      timestamp: asInstant('2024-01-01T10:00:00.000Z'),
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    } as unknown as GraphEvent;

    const legacySentinel = {
      type: 'NodeCreated',
      eventId: asEventId('018d9002-0000-7000-8000-000000000000'),
      id: asNodeId('node-open-sentinel'),
      nodeType: 'canopy:open',
      properties: new Map(),
      timestamp: asInstant('2024-01-01T10:01:00.000Z'),
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    } as unknown as GraphEvent;

    const legacyEdge = {
      type: 'EdgeCreated',
      eventId: asEventId('018d9003-0000-7000-8000-000000000000'),
      id: createEdgeId(),
      edgeType: 'legacy:rel',
      source: asNodeId('node-legacy'),
      target: asNodeId('node-open-sentinel'),
      properties: new Map(),
      timestamp: asInstant('2024-01-01T10:02:00.000Z'),
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    } as unknown as GraphEvent;

    const openEdge: GraphEvent = {
      type: 'EdgeCreated',
      eventId: asEventId('018d9004-0000-7000-8000-000000000000'),
      id: createEdgeId(),
      source: asNodeId('node-legacy'),
      target: asNodeId('node-open-sentinel'),
      properties: new Map(),
      timestamp: asInstant('2024-01-01T10:03:00.000Z'),
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    };

    await unwrap(
      await adapter.appendEvents('legacy-graph', [
        legacyNode,
        legacySentinel,
        legacyEdge,
        openEdge,
      ]),
    );
    const result = unwrap(await adapter.getEvents('legacy-graph'));
    expect(result).toHaveLength(4);
    expect(result[0]?.type === 'NodeCreated' && result[0].shapeId).toBe(asShapeId('legacy:task'));
    expect(result[1]?.type === 'NodeCreated' && result[1].shapeId).toBeUndefined();
    expect(result[2]?.type === 'EdgeCreated' && result[2].shapeId).toBe(asShapeId('legacy:rel'));
    expect(result[3]?.type === 'EdgeCreated' && result[3].shapeId).toBeUndefined();
  });
});
