import { describe, it, expect, beforeEach } from 'bun:test';
import { getGraphAt } from '../src/history';
import {
  asNodeId,
  asTypeId,
  asInstant,
  asDeviceId,
  unwrap,
  ok,
  type EventLogStore,
  type EventLogQueryOptions,
  type GraphEvent,
  type NodeCreated,
  type NodePropertiesUpdated,
  type NodeDeleted,
  type Instant,
  type EventId,
  type Result,
} from '@canopy/graph';

const mockGraphId = 'test-graph-id';

// In-memory EventLogStore stub -- history.test.ts only needs appendEvents +
// getEvents({ before }), so a real backend (e.g. SQLite) would introduce a
// dev-only cycle back into @canopy/graph, violating invariant #1 (graph is
// the leaf). See packages/storage's createInMemoryEventStore for the
// full-featured equivalent.
function createInMemoryEventLogStore(): EventLogStore {
  const eventsByGraph = new Map<string, readonly GraphEvent[]>();

  return {
    appendEvents: (
      graphId: string,
      events: readonly GraphEvent[],
    ): Promise<Result<void, Error>> => {
      const existing = eventsByGraph.get(graphId) ?? [];
      eventsByGraph.set(
        graphId,
        [...existing, ...events].toSorted((a, b) => a.eventId.localeCompare(b.eventId)),
      );
      return Promise.resolve(ok(undefined));
    },
    getEvents: (
      graphId: string,
      options?: EventLogQueryOptions,
    ): Promise<Result<readonly GraphEvent[], Error>> => {
      const events = eventsByGraph.get(graphId) ?? [];
      const filtered = events.filter(
        (event) =>
          (!options?.after || event.eventId > options.after) &&
          (!options?.before || event.eventId < options.before),
      );
      return Promise.resolve(ok(options?.reverse ? filtered.toReversed() : filtered));
    },
  };
}

function createEventIdAt(timestamp: Instant, seq: number): EventId {
  const epochMs = Temporal.Instant.from(timestamp).epochMilliseconds;
  const hex = epochMs.toString(16).padStart(12, '0');
  const part1 = hex.slice(0, 8);
  const part2 = hex.slice(8, 12);
  // Using seq to vary random part to avoid collisions.
  // Seq is put in rand_b low bits to avoid messing with variant/version if I were to put it high.
  // Actually, I can put it in rand_b (last part).
  // "7000-8000-" + ...
  const seqHex = seq.toString(16).padStart(12, '0');
  return `${part1}-${part2}-7000-8000-${seqHex}` as EventId;
}

describe('Time Travel API', () => {
  let adapter: EventLogStore;

  beforeEach(() => {
    adapter = createInMemoryEventLogStore();
  });

  it('should reconstruct graph at specific timestamps', async () => {
    // Timeline:
    // T1 (10:00): Create Node A
    // T2 (10:01): Create Node B
    // T3 (10:02): Update Node A property
    // T4 (10:03): Delete Node B

    const t1 = asInstant('2024-01-01T10:00:00.000Z');
    const t2 = asInstant('2024-01-01T10:01:00.000Z');
    const t3 = asInstant('2024-01-01T10:02:00.000Z');
    const t4 = asInstant('2024-01-01T10:03:00.000Z');

    const nodeA = asNodeId('node-a');
    const nodeB = asNodeId('node-b');

    const event1: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventIdAt(t1, 1),
      id: nodeA,
      nodeType: asTypeId('person'),
      properties: new Map([['name', 'Alice']]),
      timestamp: t1,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000001'),
    };

    const event2: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventIdAt(t2, 1),
      id: nodeB,
      nodeType: asTypeId('person'),
      properties: new Map([['name', 'Bob']]),
      timestamp: t2,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000001'),
    };

    const event3: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventIdAt(t3, 1),
      id: nodeA,
      changes: new Map([['age', 30]]),
      timestamp: t3,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000001'),
    };

    const event4: NodeDeleted = {
      type: 'NodeDeleted',
      eventId: createEventIdAt(t4, 1),
      id: nodeB,
      timestamp: t4,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000001'),
    };

    await unwrap(await adapter.appendEvents(mockGraphId, [event1, event2, event3, event4]));

    // Query at T1 (should have A)
    const graphAtT1 = unwrap(await getGraphAt(adapter, mockGraphId, { timestamp: t1 }));
    expect(graphAtT1.nodes.has(nodeA)).toBe(true);
    expect(graphAtT1.nodes.get(nodeA)?.properties.get('name')).toBe('Alice');

    // Query at T1.5 (between T1 and T2) -> Should be same as T1
    const t1_5 = asInstant('2024-01-01T10:00:30.000Z');
    const graphAtT1_5 = unwrap(await getGraphAt(adapter, mockGraphId, { timestamp: t1_5 }));
    expect(graphAtT1_5.nodes.has(nodeA)).toBe(true);
    expect(graphAtT1_5.nodes.has(nodeB)).toBe(false);

    // Query at T2 (should have A and B)
    const graphAtT2 = unwrap(await getGraphAt(adapter, mockGraphId, { timestamp: t2 }));
    expect(graphAtT2.nodes.has(nodeB)).toBe(true);

    // Query at T3 (A updated)
    const graphAtT3 = unwrap(await getGraphAt(adapter, mockGraphId, { timestamp: t3 }));
    expect(graphAtT3.nodes.get(nodeA)?.properties.get('age')).toBe(30);

    // Query at T4 (B deleted)
    const graphAtT4 = unwrap(await getGraphAt(adapter, mockGraphId, { timestamp: t4 }));
    expect(graphAtT4.nodes.has(nodeB)).toBe(false);
  });

  it('should reconstruct graph at specific eventId', async () => {
    const t1 = asInstant('2024-01-01T10:00:00.000Z');
    const eventId1 = createEventIdAt(t1, 1); // Node A created
    const eventId2 = createEventIdAt(t1, 2); // Node A updated

    const nodeA = asNodeId('node-a');

    const event1: NodeCreated = {
      type: 'NodeCreated',
      eventId: eventId1,
      id: nodeA,
      nodeType: asTypeId('person'),
      properties: new Map([['name', 'Alice']]),
      timestamp: t1,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000001'),
    };

    const event2: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: eventId2,
      id: nodeA,
      changes: new Map([['name', 'Alice Cooper']]),
      timestamp: t1,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000002'),
    };

    await unwrap(await adapter.appendEvents(mockGraphId, [event1, event2]));

    // Query at event1 (should see creation but not update)
    const graphAtE1 = unwrap(await getGraphAt(adapter, mockGraphId, { eventId: eventId1 }));
    expect(graphAtE1.nodes.get(nodeA)?.properties.get('name')).toBe('Alice');

    // Query at event2 (should see update)
    const graphAtE2 = unwrap(await getGraphAt(adapter, mockGraphId, { eventId: eventId2 }));
    expect(graphAtE2.nodes.get(nodeA)?.properties.get('name')).toBe('Alice Cooper');
  });
});
