import { describe, it, expect } from 'bun:test';
import {
  unwrap,
  createEventId,
  createNodeId,
  asTypeId,
  asDeviceId,
  createInstant,
} from '@canopy/types';
import type { GraphEvent } from '@canopy/types';
import { InMemoryEventStore } from './in-memory-event-store';

describe('InMemoryEventStore', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');
  const timestamp = createInstant();

  const createTestEvent = (): GraphEvent => ({
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    nodeType: asTypeId('test-node'),
    properties: new Map(),
    timestamp,
    deviceId,
  });

  it('appends events and retrieves them in order', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event2, event1]);
    await store.appendEvents('graph1', [event3]);

    const result = unwrap(await store.getEvents('graph1'));
    // the eventId order is determined by UUIDv7, which is time-based.
    // since we generated them in order, event1 < event2 < event3.
    expect(result).toEqual([event1, event2, event3]);
  });

  it('deduplicates events by eventId', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2]);
    await store.appendEvents('graph1', [event2, event1]);

    const result = unwrap(await store.getEvents('graph1'));
    expect(result).toHaveLength(2);
    expect(result).toEqual([event1, event2]);
  });

  it('filters events using the "after" option', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { after: event1.eventId }));
    expect(result).toEqual([event2, event3]);
  });

  it('filters events using the "before" option', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { before: event3.eventId }));
    expect(result).toEqual([event1, event2]);
  });

  it('limits the number of returned events using the "limit" option', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { limit: 2 }));
    expect(result).toEqual([event1, event2]);
  });

  it('reverses the returned events using the "reverse" option', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { reverse: true }));
    expect(result).toEqual([event3, event2, event1]);
  });

  it('isolates multiple graphIds from each other', async () => {
    const store = new InMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    await store.appendEvents('graph1', [event1]);
    await store.appendEvents('graph2', [event2]);

    const result1 = unwrap(await store.getEvents('graph1'));
    expect(result1).toEqual([event1]);

    const result2 = unwrap(await store.getEvents('graph2'));
    expect(result2).toEqual([event2]);
  });
});
