import { describe, it, expect } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import { maxEventIdForTimestamp, incrementEventId, getGraphAt } from './time-travel';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  unwrap,
  createEventId,
  asTypeId,
  asDeviceId,
  asEventId,
  createInstant,
  parseInstant,
  asGraphId,
  asNodeId,
  type NodeCreated,
} from '@canopy/types';

describe('time-travel', () => {
  describe('maxEventIdForTimestamp', () => {
    it('encodes timestamp in first 48 bits', () => {
      // 2024-01-01T10:00:00.000Z -> epochMs = 1704103200000 -> hex = 018cc4774500
      const timestamp = unwrap(parseInstant('2024-01-01T10:00:00.000Z'));
      const eventId = maxEventIdForTimestamp(timestamp);
      expect(eventId.startsWith('018cc477-4500-')).toBe(true);
    });

    it('returns a value lexicographically greater than a real event at the same timestamp', () => {
      const timestampStr = '2024-01-01T10:00:00.000Z';
      const timestamp = unwrap(parseInstant(timestampStr));
      const maxId = maxEventIdForTimestamp(timestamp);

      // UUIDv7 starts with the 48-bit timestamp. A real event will have random bits following.
      // So its hex representation will be strictly less than the maxId which has fff...
      // Let's create a dummy real event ID at that timestamp
      const realEventId = asEventId('018cc477-4500-7000-8000-000000000000');

      expect(maxId > realEventId).toBe(true);
    });

    it('returns the same value for the same timestamp', () => {
      const timestamp = createInstant();
      const id1 = maxEventIdForTimestamp(timestamp);
      const id2 = maxEventIdForTimestamp(timestamp);
      expect(id1).toBe(id2);
    });
  });

  describe('incrementEventId', () => {
    it('increments a basic string properly', () => {
      const id = asEventId('018d9000-0000-7000-8000-000000000000');
      const incremented = incrementEventId(id);
      expect(incremented).toBe(asEventId('018d9000-0000-7000-8000-000000000001'));
    });

    it('returns a value lexicographically greater than the input', () => {
      const id = createEventId();
      const incremented = incrementEventId(id);
      expect(incremented > id).toBe(true);
    });

    it('is stable for the same input', () => {
      const id = createEventId();
      expect(incrementEventId(id)).toBe(incrementEventId(id));
    });

    it('handles carry over (f -> 0)', () => {
      const id = asEventId('018d9000-0000-7000-8000-00000000000f');
      const incremented = incrementEventId(id);
      expect(incremented).toBe(asEventId('018d9000-0000-7000-8000-000000000010'));
    });

    it('skips hyphens during carry over', () => {
      const id = asEventId('018d9000-0000-7000-8000-000000000fff');
      const incremented = incrementEventId(id);
      expect(incremented).toBe(asEventId('018d9000-0000-7000-8000-000000001000'));

      const id2 = asEventId('018d9000-0000-7000-8000-ffffffffffff');
      const inc2 = incrementEventId(id2);
      expect(inc2).toBe(asEventId('018d9000-0000-7000-8001-000000000000'));
    });
  });

  describe('getGraphAt', () => {
    const graphId = asGraphId('test-graph-id');
    const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');

    const createEvent = (i: number): NodeCreated => {
      const timestamp = unwrap(parseInstant(new Date(2024, 0, 1, 10, i).toISOString()));
      const epochMs = Temporal.Instant.from(timestamp).epochMilliseconds;
      const hex = epochMs.toString(16).padStart(12, '0');
      const part1 = hex.slice(0, 8);
      const part2 = hex.slice(8, 12);

      return {
        type: 'NodeCreated',
        eventId: asEventId(`${part1}-${part2}-7000-8000-000000000000`),
        id: asNodeId(`node-${i}`),
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp,
        deviceId,
      };
    };

    it('returns empty graph on an empty store', async () => {
      const store = createInMemoryEventStore();
      const result = await getGraphAt(store, graphId, { eventId: createEventId() });
      const graph = unwrap(result);

      // An empty graph has 23 bootstrap nodes, so it is not completely empty.
      expect(graph.nodes.size).toBe(23);
    });

    it('returns a graph with nodes created up to a specific eventId', async () => {
      const store = createInMemoryEventStore();
      const events = [createEvent(1), createEvent(2), createEvent(3)];
      await store.appendEvents(graphId, events);

      // Get graph at event 2
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await getGraphAt(store, graphId, { eventId: events[1]!.eventId });
      const graph = unwrap(result);

      // Should contain nodes from event 1 and 2, but not 3
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[0]!.id)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[1]!.id)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[2]!.id)).toBe(false);

      // 23 bootstrap + 2 new
      expect(graph.nodes.size).toBe(25);
    });

    it('returns a graph with nodes created up to a specific timestamp', async () => {
      const store = createInMemoryEventStore();
      const events = [createEvent(1), createEvent(2), createEvent(3)];
      await store.appendEvents(graphId, events);

      // Get graph at the timestamp of event 2
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await getGraphAt(store, graphId, { timestamp: events[1]!.timestamp });
      const graph = unwrap(result);

      // Should contain nodes from event 1 and 2, but not 3
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[0]!.id)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[1]!.id)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[2]!.id)).toBe(false);

      // 23 bootstrap + 2 new
      expect(graph.nodes.size).toBe(25);
    });

    it('returns a graph with all nodes when given the last eventId', async () => {
      const store = createInMemoryEventStore();
      const events = [createEvent(1), createEvent(2), createEvent(3)];
      await store.appendEvents(graphId, events);

      // Get graph at event 3
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const result = await getGraphAt(store, graphId, { eventId: events[2]!.eventId });
      const graph = unwrap(result);

      // Should contain all nodes
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[0]!.id)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[1]!.id)).toBe(true);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(graph.nodes.has(events[2]!.id)).toBe(true);

      // 23 bootstrap + 3 new
      expect(graph.nodes.size).toBe(26);
    });
  });
});
