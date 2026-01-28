import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from './sqlite-adapter';
import { unwrap, asNodeId, asTypeId, asEventId, asInstant } from '@canopy/types';
import type { NodeCreated, GraphEvent } from '@canopy/types';

const mockGraphId = 'test-graph-id';

// Helper to create events
const createEvent = (i: number): NodeCreated => ({
  type: 'NodeCreated',
  eventId: asEventId(`018d9${i.toString().padStart(3, '0')}-0000-7000-8000-000000000000`), // Dummy UUIDv7-ish
  id: asNodeId(`node-${i}`),
  nodeType: asTypeId('test-type'),
  properties: new Map(),
  timestamp: asInstant(new Date(2024, 0, 1, 10, i).toISOString()),
});

describe('SQLiteAdapter EventLog', () => {
  // eslint-disable-next-line functional/prefer-readonly-type
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    adapter = new SQLiteAdapter();
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
    expect(result[0].eventId).toEqual(events[0].eventId);
    expect(result[1].eventId).toEqual(events[1].eventId);
  });

  it('should filter by after (incremental sync)', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    // Get events after event 1
    const result = unwrap(await adapter.getEvents(mockGraphId, { after: events[0].eventId }));
    expect(result).toHaveLength(2);
    expect(result[0].eventId).toEqual(events[1].eventId);
    expect(result[1].eventId).toEqual(events[2].eventId);
  });

  it('should filter by before', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    // Get events before event 3
    const result = unwrap(await adapter.getEvents(mockGraphId, { before: events[2].eventId }));
    expect(result).toHaveLength(2);
    expect(result[0].eventId).toEqual(events[0].eventId);
    expect(result[1].eventId).toEqual(events[1].eventId);
  });

  it('should respect limit', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { limit: 2 }));
    expect(result).toHaveLength(2);
    expect(result[0].eventId).toEqual(events[0].eventId);
    expect(result[1].eventId).toEqual(events[1].eventId);
  });

  it('should sort reverse', async () => {
    const events = [createEvent(1), createEvent(2), createEvent(3)];
    await unwrap(await adapter.appendEvents(mockGraphId, events));

    const result = unwrap(await adapter.getEvents(mockGraphId, { reverse: true }));
    expect(result).toHaveLength(3);
    expect(result[0].eventId).toEqual(events[2].eventId);
    expect(result[1].eventId).toEqual(events[1].eventId);
    expect(result[2].eventId).toEqual(events[0].eventId);
  });

  it('should ignore duplicate events', async () => {
    const event = createEvent(1);
    await unwrap(await adapter.appendEvents(mockGraphId, [event]));
    await unwrap(await adapter.appendEvents(mockGraphId, [event])); // Append same event again

    const result = unwrap(await adapter.getEvents(mockGraphId));
    expect(result).toHaveLength(1);
  });
});
