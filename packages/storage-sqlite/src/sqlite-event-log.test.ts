import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createSQLiteEventLog } from './sqlite-event-log';
import type { SQLiteEventLog } from './sqlite-event-log';
import { unwrap, asNodeId, asTypeId, asEventId, asInstant, asDeviceId } from '@canopy/graph';
import type { NodeCreated, GraphEvent } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';

const mockGraphId = 'test-graph-id';

// Helper to create events
const createEvent = (i: number): NodeCreated => ({
  type: 'NodeCreated',
  eventId: asEventId(`018d9${i.toString().padStart(3, '0')}-0000-7000-8000-000000000000`), // Dummy UUIDv7-ish
  id: asNodeId(`node-${i}`),
  nodeType: asTypeId('test-type'),
  properties: new Map(),
  timestamp: asInstant(
    Temporal.Instant.from(`2024-01-01T10:${String(i).padStart(2, '0')}:00.000Z`).toString(),
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
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.eventId).toEqual(events[0]!.eventId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[1]!.eventId).toEqual(events[1]!.eventId);
  });

  it('should filter by after (incremental sync)', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    // Get events after event 1
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = unwrap(await adapter.getEvents(mockGraphId, { after: events[0]!.eventId }));
    expect(result).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.eventId).toEqual(events[1]!.eventId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[1]!.eventId).toEqual(events[2]!.eventId);
  });

  it('should filter by before', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    // Get events before event 3
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const result = unwrap(await adapter.getEvents(mockGraphId, { before: events[2]!.eventId }));
    expect(result).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.eventId).toEqual(events[0]!.eventId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[1]!.eventId).toEqual(events[1]!.eventId);
  });

  it('should respect limit', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { limit: 2 }));
    expect(result).toHaveLength(2);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.eventId).toEqual(events[0]!.eventId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[1]!.eventId).toEqual(events[1]!.eventId);
  });

  it('should sort reverse', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { reverse: true }));
    expect(result).toHaveLength(3);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[0]!.eventId).toEqual(events[2]!.eventId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[1]!.eventId).toEqual(events[1]!.eventId);
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(result[2]!.eventId).toEqual(events[0]!.eventId);
  });

  it('should ignore duplicate events', async () => {
    const event = createEvent(1);
    await unwrap(await adapter.appendEvents(mockGraphId, [event]));
    await unwrap(await adapter.appendEvents(mockGraphId, [event])); // Append same event again

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(1);
  });
});
