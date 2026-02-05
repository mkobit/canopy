import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteAdapter } from '@canopy/storage';
import { getGraphAt } from '../src/time-travel';
import {
  asNodeId,
  asTypeId,
  asInstant,
  unwrap,
  type NodeCreated,
  type NodePropertiesUpdated,
  type NodeDeleted,
  type Instant,
  type EventId,
} from '@canopy/types';
import { Temporal } from 'temporal-polyfill';

const mockGraphId = 'test-graph-id';

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
  let adapter: SQLiteAdapter;

  beforeEach(async () => {
    adapter = new SQLiteAdapter();
    await unwrap(await adapter.init());
  });

  afterEach(async () => {
    await unwrap(await adapter.close());
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
    };

    const event2: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventIdAt(t2, 1),
      id: nodeB,
      nodeType: asTypeId('person'),
      properties: new Map([['name', 'Bob']]),
      timestamp: t2,
    };

    const event3: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventIdAt(t3, 1),
      id: nodeA,
      changes: new Map([['age', 30]]),
      timestamp: t3,
    };

    const event4: NodeDeleted = {
      type: 'NodeDeleted',
      eventId: createEventIdAt(t4, 1),
      id: nodeB,
      timestamp: t4,
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
    };

    const event2: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: eventId2,
      id: nodeA,
      changes: new Map([['name', 'Alice Cooper']]),
      timestamp: t1, // Same timestamp, later event ID
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
