import { describe, it, expect } from 'bun:test';
import { createGraphSession, type GraphSessionDelta } from './graph-session';
import { projectGraph } from './projection';
import { createGraph } from './create-graph';
import type { EventLogStore, EventLogQueryOptions } from './event-log';
import {
  createGraphId,
  createNodeId,
  createEdgeId,
  asTypeId,
  createEventId,
  asDeviceId,
  createInstant,
  unwrap,
  ok,
  type GraphEvent,
  type Graph,
  type NodeCreated,
  type NodePropertiesUpdated,
  type EdgeCreated,
  SYSTEM_IDS,
  SYSTEM_EDGE_TYPES,
} from '@canopy/graph';

/** Minimal in-process EventLogStore fake, local to this test -- @canopy/graph is a leaf package. */
function createTestEventLog(): EventLogStore {
  const events: GraphEvent[] = [];
  return {
    appendEvents: (_graphId, newEvents) => {
      const seen = new Set(events.map((e) => e.eventId));
      for (const event of newEvents) {
        if (!seen.has(event.eventId)) {
          events.push(event);
          seen.add(event.eventId);
        }
      }
      events.sort((a, b) => a.eventId.localeCompare(b.eventId));
      return Promise.resolve(ok(undefined));
    },
    getEvents: (_graphId, options?: EventLogQueryOptions) => {
      let result = [...events];
      const after = options?.after;
      if (after !== undefined) {
        result = result.filter((e) => e.eventId > after);
      }
      const before = options?.before;
      if (before !== undefined) {
        result = result.filter((e) => e.eventId < before);
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

const sessionDeviceId = asDeviceId('00000000-0000-0000-0000-0000000000aa');
const otherDeviceId = asDeviceId('00000000-0000-0000-0000-0000000000bb');

function nodeCreatedEvent(overrides: Partial<NodeCreated> = {}): NodeCreated {
  return {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
    nodeType: asTypeId('test-type'),
    properties: new Map([['name', 'a']]),
    timestamp: createInstant(),
    deviceId: otherDeviceId,
    ...overrides,
  };
}

describe('GraphSession', () => {
  it('graph() returns a bootstrapped graph before load() is called', () => {
    const session = createGraphSession(createTestEventLog(), createGraphId(), sessionDeviceId);
    expect(session.graph().nodes.size).toBeGreaterThan(0); // system bootstrap nodes
  });

  it('commit validates, appends, merges, and notifies subscribers with the applied delta', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const notifications: Readonly<{ graph: Graph; delta: GraphSessionDelta }>[] = [];
    const unsubscribe = session.subscribe((graph, delta) => {
      notifications.push({ graph, delta });
    });

    const event = nodeCreatedEvent();
    const result = await session.commit([event]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.nodes.has(event.id)).toBe(true);

    expect(notifications.length).toBe(1);
    expect(notifications[0]?.delta.applied.map((e) => e.eventId)).toEqual([event.eventId]);
    expect(notifications[0]?.graph.nodes.has(event.id)).toBe(true);

    unsubscribe();
  });

  it('stamps committed events with the session deviceId, regardless of the caller-supplied deviceId', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const event = nodeCreatedEvent({ deviceId: otherDeviceId });
    await session.commit([event]);

    const storedResult = await eventLog.getEvents(graphId);
    expect(storedResult.ok).toBe(true);
    if (!storedResult.ok) return;
    const stored = storedResult.value.find((e) => e.eventId === event.eventId);
    expect(stored?.deviceId).toBe(sessionDeviceId);
  });

  it('rejects a commit with a referentially invalid event: nothing appended, graph unchanged', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();
    const graphBefore = session.graph();

    const danglingEdge: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: createEdgeId(),
      edgeType: asTypeId('test-edge-type'),
      source: createNodeId(), // never created
      target: createNodeId(), // never created
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: otherDeviceId,
    };

    const result = await session.commit([danglingEdge]);
    expect(result.ok).toBe(false);

    const storedResult = await eventLog.getEvents(graphId);
    expect(storedResult.ok).toBe(true);
    if (storedResult.ok) {
      expect(storedResult.value.length).toBe(0);
    }
    expect(session.graph()).toEqual(graphBefore);
  });

  it('rejects an update targeting a node that does not exist', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const update: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: createNodeId(), // never created
      changes: new Map([['name', 'b']]),
      timestamp: createInstant(),
      deviceId: otherDeviceId,
    };

    const result = await session.commit([update]);
    expect(result.ok).toBe(false);
  });

  it('load() projects the persisted log identically to canonical projectGraph over the sorted log', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();

    const nodeA = nodeCreatedEvent();
    const nodeB = nodeCreatedEvent();
    const edge: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: createEdgeId(),
      edgeType: asTypeId('test-edge-type'),
      source: nodeA.id,
      target: nodeB.id,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: otherDeviceId,
    };
    await eventLog.appendEvents(graphId, [nodeA, nodeB, edge]);

    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    const loadResult = await session.load();
    expect(loadResult.ok).toBe(true);

    // Bootstrap system nodes get their own fresh real-clock timestamps on
    // every independent createGraph() call, so a full deep-equal against a
    // separately-bootstrapped "canonical" graph would never match bit for
    // bit. Compare canonical fold vs. session projection starting from the
    // *same* initial graph instead -- that's the actual invariant under test.
    const initial = unwrap(createGraph(graphId, 'graph'));
    const canonical = unwrap(projectGraph([nodeA, nodeB, edge], initial));

    const loaded = loadResult.ok ? loadResult.value : session.graph();
    expect(loaded.nodes.get(nodeA.id)).toEqual(canonical.nodes.get(nodeA.id));
    expect(loaded.nodes.get(nodeB.id)).toEqual(canonical.nodes.get(nodeB.id));
    expect(loaded.edges.get(edge.id)).toEqual(canonical.edges.get(edge.id));
    expect(loaded.nodes.size).toBe(canonical.nodes.size);
    expect(loaded.edges.size).toBe(canonical.edges.size);
  });

  it('commit is a no-op for an empty event list', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();
    const before = session.graph();

    const result = await session.commit([]);
    expect(result.ok).toBe(true);
    expect(session.graph()).toEqual(before);
  });

  it('allows creating an edge pointing to a bootstrapped node', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const userNode = nodeCreatedEvent();
    const edge: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: createEdgeId(),
      edgeType: SYSTEM_EDGE_TYPES.REFERENCES,
      source: userNode.id,
      target: SYSTEM_IDS.NAMESPACE_SYSTEM,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: otherDeviceId,
    };

    const result = await session.commit([userNode, edge]);
    expect(result.ok).toBe(true);
    expect(session.graph().edges.has(edge.id)).toBe(true);
  });

  it('unsubscribe stops further notifications', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    let callCount = 0;
    const unsubscribe = session.subscribe(() => {
      callCount += 1;
    });

    await session.commit([nodeCreatedEvent()]);
    unsubscribe();
    await session.commit([nodeCreatedEvent()]);

    expect(callCount).toBe(1);
  });
});
