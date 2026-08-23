import { describe, it, expect } from 'bun:test';
import { maxEventIdForTimestamp, incrementEventId, getGraphAt } from './history';
import type { EventLogStore, EventLogQueryOptions } from './event-log';
import type { GraphEvent } from './events';
import { ok } from './result';
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
} from './index';

function createTestEventLog(): EventLogStore {
  const events: GraphEvent[] = [];
  return {
    appendEvents: (_graphId, newEvents) => {
      const seen = new Set(events.map((event) => event.eventId));
      for (const event of newEvents) {
        if (seen.has(event.eventId)) {
          continue;
        }
        events.push(event);
        seen.add(event.eventId);
      }
      events.sort((a, b) => a.eventId.localeCompare(b.eventId));
      return Promise.resolve(ok(undefined));
    },
    getEvents: (_graphId, options?: EventLogQueryOptions) => {
      let result = [...events];
      const after = options?.after;
      if (after !== undefined) {
        result = result.filter((event) => event.eventId > after);
      }
      const before = options?.before;
      if (before !== undefined) {
        result = result.filter((event) => event.eventId < before);
      }
      if (options?.reverse) {
        result.reverse();
      }
      if (options?.limit !== undefined) {
        result = result.slice(0, options.limit);
      }
      return Promise.resolve(ok(result));
    },
  };
}

describe('time-travel', () => {
  describe('maxEventIdForTimestamp', () => {
    it('encodes timestamp in first 48 bits', () => {
      // 2024-01-01T10:00:00.000Z -> epochMs = 1704103200000 -> hex = 018cc4774500
      const timestamp = unwrap(parseInstant('2024-01-01T10:00:00.000Z'));
      const eventId = maxEventIdForTimestamp(timestamp);
      expect(eventId.startsWith('018cc477-4500-')).toBe(true);
    });

    it('returns a value lexicographically greater than a real event at the same timestamp', () => {
      const timestampString = '2024-01-01T10:00:00.000Z';
      const timestamp = unwrap(parseInstant(timestampString));
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

    const createEvent = (index: number): NodeCreated => {
      const timestamp = unwrap(
        parseInstant(`2024-01-01T10:${String(index).padStart(2, '0')}:00.000Z`),
      );
      const epochMs = Temporal.Instant.from(timestamp).epochMilliseconds;
      const hex = epochMs.toString(16).padStart(12, '0');
      const part1 = hex.slice(0, 8);
      const part2 = hex.slice(8, 12);

      return {
        type: 'NodeCreated',
        eventId: asEventId(`${part1}-${part2}-7000-8000-000000000000`),
        id: asNodeId(`node-${index}`),
        nodeType: asTypeId('test-type'),
        properties: new Map(),
        timestamp,
        deviceId,
      };
    };

    it('returns empty graph on an empty store', async () => {
      const store = createTestEventLog();
      const result = await getGraphAt(store, graphId, { eventId: createEventId() });
      const graph = unwrap(result);

      // An empty graph has 42 bootstrap nodes, so it is not completely empty.
      expect(graph.nodes.size).toBe(42);
    });

    it('returns a graph with nodes created up to a specific eventId', async () => {
      const store = createTestEventLog();
      const event1 = createEvent(1);
      const event2 = createEvent(2);
      const event3 = createEvent(3);
      await store.appendEvents(graphId, [event1, event2, event3]);

      // Get graph at event 2
      const result = await getGraphAt(store, graphId, { eventId: event2.eventId });
      const graph = unwrap(result);

      // Should contain nodes from event 1 and 2, but not 3
      expect(graph.nodes.has(event1.id)).toBe(true);
      expect(graph.nodes.has(event2.id)).toBe(true);
      expect(graph.nodes.has(event3.id)).toBe(false);

      // 42 bootstrap + 2 new
      expect(graph.nodes.size).toBe(44);
    });

    it('returns a graph with nodes created up to a specific timestamp', async () => {
      const store = createTestEventLog();
      const event1 = createEvent(1);
      const event2 = createEvent(2);
      const event3 = createEvent(3);
      await store.appendEvents(graphId, [event1, event2, event3]);

      // Get graph at the timestamp of event 2
      const result = await getGraphAt(store, graphId, { timestamp: event2.timestamp });
      const graph = unwrap(result);

      // Should contain nodes from event 1 and 2, but not 3
      expect(graph.nodes.has(event1.id)).toBe(true);
      expect(graph.nodes.has(event2.id)).toBe(true);
      expect(graph.nodes.has(event3.id)).toBe(false);

      // 42 bootstrap + 2 new
      expect(graph.nodes.size).toBe(44);
    });

    it('returns a graph with all nodes when given the last eventId', async () => {
      const store = createTestEventLog();
      const event1 = createEvent(1);
      const event2 = createEvent(2);
      const event3 = createEvent(3);
      await store.appendEvents(graphId, [event1, event2, event3]);

      // Get graph at event 3
      const result = await getGraphAt(store, graphId, { eventId: event3.eventId });
      const graph = unwrap(result);

      // Should contain all nodes
      expect(graph.nodes.has(event1.id)).toBe(true);
      expect(graph.nodes.has(event2.id)).toBe(true);
      expect(graph.nodes.has(event3.id)).toBe(true);

      // 42 bootstrap + 3 new
      expect(graph.nodes.size).toBe(45);
    });
  });
});
