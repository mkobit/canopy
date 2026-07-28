import { describe, it, expect, setSystemTime } from 'bun:test';
import { projectGraph, applyEvent } from './projection';
import { createGraph } from './create-graph';
import {
  createGraphId,
  createNodeId,
  asTypeId,
  createEventId,
  asDeviceId,
  createInstant,
  unwrap,
  type NodeCreated,
  type NodePropertiesUpdated,
} from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';

describe('projection / LWW sync', () => {
  const deviceA = asDeviceId('00000000-0000-0000-0000-00000000000A');
  const deviceB = asDeviceId('00000000-0000-0000-0000-00000000000B');

  it('sorts events by eventId correctly in projectGraph', () => {
    const g = unwrap(createGraph(createGraphId(), 'test-graph'));

    setSystemTime(Temporal.Instant.from('2024-01-01T10:00:00Z').epochMilliseconds);
    const t1 = createInstant();
    const id1 = createNodeId();
    const event1: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: id1,
      nodeType: asTypeId('test-type'),
      properties: new Map([['test', '1']]),
      timestamp: t1,
      deviceId: deviceA,
    };

    setSystemTime(Temporal.Instant.from('2024-01-01T11:00:00Z').epochMilliseconds);
    const t2 = createInstant();
    const event2: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(), // this gets a later UUIDv7 than event1
      id: id1,
      changes: new Map([['test', '2']]),
      timestamp: t2,
      deviceId: deviceA,
    };

    // Apply out of order
    const result = projectGraph([event2, event1], g);
    expect(result.ok).toBe(true);

    const finalGraph = unwrap(result);
    const node = finalGraph.nodes.get(id1);
    expect(node).toBeDefined();
    expect(node?.properties.get('test')).toBe('2'); // event2 applied after event1

    // reset time
    setSystemTime();
  });

  it('applies LWW using timestamp for NodePropertiesUpdated', () => {
    const g = unwrap(createGraph(createGraphId(), 'test-graph'));
    const id = createNodeId();

    const t0 = '2024-01-01T10:00:00.000Z' as unknown as import('@canopy/graph').Instant;
    const t1 = '2024-01-01T11:00:00.000Z' as unknown as import('@canopy/graph').Instant;

    const event0: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map([['test', '0']]),
      timestamp: t0,
      deviceId: deviceA,
    };

    // New event (wins)
    const event1: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id,
      changes: new Map([['test', 'new']]),
      timestamp: t1,
      deviceId: deviceB,
    };

    // Old event (discarded)
    const event2: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id,
      changes: new Map([['test', 'old']]),
      timestamp: t0,
      deviceId: deviceA,
    };

    const r0 = applyEvent(g, event0);
    const g0 = unwrap(r0);

    // Apply new, then old
    const r1 = applyEvent(g0, event1);
    const g1 = unwrap(r1);

    expect(g1.nodes.get(id)?.properties.get('test')).toBe('new');

    const r2 = applyEvent(g1, event2);
    const g2 = unwrap(r2);

    expect(g2.nodes.get(id)?.properties.get('test')).toBe('new'); // still new
  });

  it('uses deviceId as tiebreaker when timestamps are equal', () => {
    const g = unwrap(createGraph(createGraphId(), 'test-graph'));
    const id = createNodeId();
    const t = '2024-01-01T10:00:00.000Z' as unknown as import('@canopy/graph').Instant;

    const event0: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map([['test', '0']]),
      timestamp: t,
      deviceId: deviceA,
    };

    const r0 = unwrap(applyEvent(g, event0));

    // event from A
    const event1: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id,
      changes: new Map([['test', 'fromA']]),
      timestamp: t,
      deviceId: deviceA,
    };

    // event from B (B > A lexicographically)
    const event2: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id,
      changes: new Map([['test', 'fromB']]),
      timestamp: t,
      deviceId: deviceB,
    };

    // Apply A then B -> B wins because B > A
    const r1 = unwrap(applyEvent(unwrap(applyEvent(r0, event1)), event2));
    expect(r1.nodes.get(id)?.properties.get('test')).toBe('fromB');

    // Apply B then A -> B still wins
    const r2 = unwrap(applyEvent(unwrap(applyEvent(r0, event2)), event1));
    expect(r2.nodes.get(id)?.properties.get('test')).toBe('fromB');
  });

  it('discards an older event completely if node already has newer state', () => {
    const g = unwrap(createGraph(createGraphId(), 'test-graph'));
    const id = createNodeId();
    const t0 = '2024-01-01T10:00:00.000Z' as unknown as import('@canopy/graph').Instant;
    const t1 = '2024-01-01T11:00:00.000Z' as unknown as import('@canopy/graph').Instant;

    const event0: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map(),
      timestamp: t1,
      deviceId: deviceB,
    };

    const g0 = unwrap(applyEvent(g, event0));

    // this event has t0 < t1, it should be entirely ignored
    const eventOld: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id,
      changes: new Map([['test', 'old']]),
      timestamp: t0,
      deviceId: deviceA,
    };

    const r1 = applyEvent(g0, eventOld);
    const g1 = unwrap(r1);

    expect(g1.nodes.get(id)?.properties.has('test')).toBe(false);
  });
});
