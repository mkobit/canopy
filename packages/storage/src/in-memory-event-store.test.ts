import { describe, it, expect } from 'bun:test';
import {
  unwrap,
  createEventId,
  createNodeId,
  createEdgeId,
  asEdgeId,
  asShapeId,
  asDeviceId,
  createInstant,
} from '@canopy/graph';
import type { GraphEvent } from '@canopy/graph';
import { createInMemoryEventStore } from './in-memory-event-store';

describe('InMemoryEventStore', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');
  const timestamp = createInstant();

  const createTestEvent = (): GraphEvent => ({
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    shapeId: asShapeId('test-node'),
    properties: new Map(),
    timestamp,
    deviceId,
  });

  it('appends events and retrieves them in order', async () => {
    const store = createInMemoryEventStore();
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
    const store = createInMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2]);
    await store.appendEvents('graph1', [event2, event1]);

    const result = unwrap(await store.getEvents('graph1'));
    expect(result).toHaveLength(2);
    expect(result).toEqual([event1, event2]);
  });

  it('filters events using the "after" option', async () => {
    const store = createInMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { after: event1.eventId }));
    expect(result).toEqual([event2, event3]);
  });

  it('filters events using the "before" option', async () => {
    const store = createInMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { before: event3.eventId }));
    expect(result).toEqual([event1, event2]);
  });

  it('limits the number of returned events using the "limit" option', async () => {
    const store = createInMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { limit: 2 }));
    expect(result).toEqual([event1, event2]);
  });

  it('reverses the returned events using the "reverse" option', async () => {
    const store = createInMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();
    const event3 = createTestEvent();

    await store.appendEvents('graph1', [event1, event2, event3]);

    const result = unwrap(await store.getEvents('graph1', { reverse: true }));
    expect(result).toEqual([event3, event2, event1]);
  });

  it('isolates multiple graphIds from each other', async () => {
    const store = createInMemoryEventStore();
    const event1 = createTestEvent();
    const event2 = createTestEvent();

    await store.appendEvents('graph1', [event1]);
    await store.appendEvents('graph2', [event2]);

    const result1 = unwrap(await store.getEvents('graph1'));
    expect(result1).toEqual([event1]);

    const result2 = unwrap(await store.getEvents('graph2'));
    expect(result2).toEqual([event2]);
  });

  it('upcasts legacy nodeType/edgeType and canopy:open sentinel and preserves open entities', async () => {
    const store = createInMemoryEventStore();
    const n1 = createNodeId();
    const n2 = createNodeId();
    const edge1 = createEdgeId();
    const openEdgeId = asEdgeId('edge-open-1');

    const legacyTypedNode = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: n1,
      nodeType: 'legacy:note',
      properties: new Map([['title', 'Hello']]),
      timestamp,
      deviceId,
    } as unknown as GraphEvent;

    const legacyOpenSentinelNode = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: n2,
      nodeType: 'canopy:open',
      properties: new Map(),
      timestamp,
      deviceId,
    } as unknown as GraphEvent;

    const legacyEdge = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: edge1,
      edgeType: 'legacy:links',
      source: n1,
      target: n2,
      properties: new Map(),
      timestamp,
      deviceId,
    } as unknown as GraphEvent;

    const openEdge: GraphEvent = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: openEdgeId,
      source: n1,
      target: n2,
      properties: new Map(),
      timestamp,
      deviceId,
    };

    await store.appendEvents('legacy-graph', [
      legacyTypedNode,
      legacyOpenSentinelNode,
      legacyEdge,
      openEdge,
    ]);

    const events = unwrap(await store.getEvents('legacy-graph'));
    expect(events).toHaveLength(4);
    expect(events[0]?.type === 'NodeCreated' && events[0].shapeId).toBe(asShapeId('legacy:note'));
    expect(events[1]?.type === 'NodeCreated' && events[1].shapeId).toBeUndefined();
    expect(events[2]?.type === 'EdgeCreated' && events[2].shapeId).toBe(asShapeId('legacy:links'));
    expect(events[3]?.type === 'EdgeCreated' && events[3].shapeId).toBeUndefined();
  });

  it('returns error Result when decoding conflicting legacy fields', async () => {
    const store = createInMemoryEventStore();
    const badEvent = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: createNodeId(),
      shapeId: 'modern:shape',
      nodeType: 'legacy:shape',
      properties: new Map(),
      timestamp,
      deviceId,
    } as unknown as GraphEvent;

    await store.appendEvents('bad-graph', [badEvent]);
    const result = await store.getEvents('bad-graph');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Conflicting');
    }
  });
});
