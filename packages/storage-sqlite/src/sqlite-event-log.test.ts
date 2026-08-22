import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSQLiteEventLog } from './sqlite-event-log';
import type { SQLiteEventLog } from './sqlite-event-log';
import { unwrap, asNodeId, asTypeId, asEventId, asInstant, asDeviceId } from '@canopy/graph';
import type { NodeCreated, GraphEvent } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';

const mockGraphId = 'test-graph-id';

const assertDefined = <T>(
  value: T | null | undefined,
  message = 'Expected value to be defined',
): T => {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
  return value;
};

// Helper to create events
const createEvent = (index: number): NodeCreated => ({
  type: 'NodeCreated',
  eventId: asEventId(`018d9${index.toString().padStart(3, '0')}-0000-7000-8000-000000000000`), // Dummy UUIDv7-ish
  id: asNodeId(`node-${index}`),
  nodeType: asTypeId('test-type'),
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
});
