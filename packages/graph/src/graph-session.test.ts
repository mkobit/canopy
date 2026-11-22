import { describe, it, expect } from 'bun:test';
import { createGraphSession, type GraphSessionDelta } from './graph-session';
import { projectGraph } from './projection';
import { createMergeState, mergeEvents } from './incremental-projection';
import { createGraph } from './create-graph';
import type { EventLogStore, EventLogQueryOptions } from './event-log';
import {
  createGraphId,
  createNodeId,
  createEdgeId,
  asBatchId,
  asShapeId,
  asNodeId,
  createEventId,
  asEventId,
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
  SYSTEM_EDGE_SHAPES,
} from '@canopy/graph';

/**
Minimal in-process EventLogStore fake, local to this test -- @canopy/graph is a leaf package.
*/
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

const sessionDeviceId = asDeviceId('00000000-0000-0000-0000-0000000000aa');
const otherDeviceId = asDeviceId('00000000-0000-0000-0000-0000000000bb');

function nodeCreatedEvent(overrides: Partial<NodeCreated> = {}): NodeCreated {
  return {
    type: 'NodeCreated',
    eventId: createEventId(),
    id: createNodeId(),
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
    expect(result.value.graph.nodes.has(event.id)).toBe(true);

    expect(notifications.length).toBe(1);
    expect(notifications[0]?.delta.applied.map((event_) => event_.eventId)).toEqual([
      event.eventId,
    ]);
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
    const stored = storedResult.value.find((event_) => event_.eventId === event.eventId);
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
      shapeId: asShapeId('test-edge-type'),
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
      shapeId: asShapeId('test-edge-type'),
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
      shapeId: SYSTEM_EDGE_SHAPES.REFERENCES,
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
    expect(unsubscribe()).toBe(true);
    await session.commit([nodeCreatedEvent()]);

    expect(unsubscribe()).toBe(false);
    expect(callCount).toBe(1);
  });

  it('allows duplicate callback subscriptions to unsubscribe independently', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    let callCount = 0;
    const handler = (): void => {
      callCount += 1;
    };

    const unsubscribe1 = session.subscribe(handler);
    const unsubscribe2 = session.subscribe(handler);

    await session.commit([nodeCreatedEvent()]);
    expect(callCount).toBe(2);

    expect(unsubscribe1()).toBe(true);
    expect(unsubscribe1()).toBe(false);

    await session.commit([nodeCreatedEvent()]);
    expect(callCount).toBe(3);

    expect(unsubscribe2()).toBe(true);
    expect(unsubscribe2()).toBe(false);

    await session.commit([nodeCreatedEvent()]);
    expect(callCount).toBe(3);
  });

  it('rejects commits containing NodeDeleted events for system nodes', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const deleteEvent: GraphEvent = {
      type: 'NodeDeleted',
      eventId: createEventId(),
      id: asNodeId('system:renderer:text'),
      timestamp: createInstant(),
      deviceId: sessionDeviceId,
    };

    const result = await session.commit([deleteEvent]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('system-node');
    expect(result.error.message).toContain('Cannot delete system node');
  });

  it('returns N validation errors for N invalid entities and appends nothing', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const invalidNode1 = nodeCreatedEvent({ shapeId: asShapeId('missing:shape:1') });
    const invalidNode2 = nodeCreatedEvent({ shapeId: asShapeId('missing:shape:2') });
    const invalidNode3 = nodeCreatedEvent({ shapeId: asShapeId('missing:shape:3') });

    const result = await session.commit([invalidNode1, invalidNode2, invalidNode3]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('validation');
      if (result.error.kind === 'validation') {
        expect(result.error.errors).toHaveLength(3);
        expect(result.error.batchId.startsWith('batch:')).toBe(true);
      }
    }

    const stored = unwrap(await eventLog.getEvents(graphId));
    expect(stored).toHaveLength(0);
  });

  it('rejects empty batchId or multiple distinct batchIds in a single commit', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const emptyBatchResult = await session.commit([nodeCreatedEvent({ batchId: asBatchId('') })]);
    expect(emptyBatchResult.ok).toBe(false);
    if (!emptyBatchResult.ok) {
      expect(emptyBatchResult.error.kind).toBe('batch');
    }

    const mixedBatchResult = await session.commit([
      nodeCreatedEvent({ batchId: asBatchId('batch:one') }),
      nodeCreatedEvent({ batchId: asBatchId('batch:two') }),
    ]);
    expect(mixedBatchResult.ok).toBe(false);
    if (!mixedBatchResult.ok) {
      expect(mixedBatchResult.error.kind).toBe('batch');
    }
  });

  it('stamps all appended events with one shared batchId and returns warnings', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const edgeShapeId = asShapeId('shape:test:restricted-edge');
    const shapeEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: asNodeId(edgeShapeId),
      shapeId: SYSTEM_IDS.SHAPE,
      properties: new Map<string, string | boolean | readonly string[]>([
        ['name', 'RestrictedEdge'],
        ['namespace', 'user'],
        ['entityKind', 'edge'],
        ['closed', false],
        ['sourceTypes', [asShapeId('shape:test:expected-source')]],
      ]),
      timestamp: createInstant(),
      deviceId: sessionDeviceId,
    };
    const node1 = nodeCreatedEvent();
    const node2 = nodeCreatedEvent();
    const edge: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: createEdgeId(),
      shapeId: edgeShapeId,
      source: node1.id,
      target: node2.id,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: sessionDeviceId,
    };

    const result = await session.commit([shapeEvent, node1, node2, edge]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.batchId.startsWith('batch:')).toBe(true);
    expect(result.value.events).toHaveLength(4);
    expect(result.value.events.every((event) => event.batchId === result.value.batchId)).toBe(true);
    expect(result.value.warnings.length).toBeGreaterThan(0);

    const stored = unwrap(await eventLog.getEvents(graphId));
    expect(stored).toHaveLength(4);
    expect(stored.every((event) => event.batchId === result.value.batchId)).toBe(true);
  });

  it('serializes concurrent commit and load calls on the same GraphSession', async () => {
    const baseLog = createTestEventLog();
    const delayedLog: EventLogStore = {
      appendEvents: async (graphId, newEvents) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return baseLog.appendEvents(graphId, newEvents);
      },
      getEvents: async (graphId, options) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return baseLog.getEvents(graphId, options);
      },
    };
    const graphId = createGraphId();
    const session = createGraphSession(delayedLog, graphId, sessionDeviceId);
    await session.load();

    const n1 = nodeCreatedEvent();
    const n2 = nodeCreatedEvent();
    const n3 = nodeCreatedEvent();

    const results = await Promise.all([
      session.commit([n1]),
      session.commit([n2]),
      session.load(),
      session.commit([n3]),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(session.graph().nodes.has(n1.id)).toBe(true);
    expect(session.graph().nodes.has(n2.id)).toBe(true);
    expect(session.graph().nodes.has(n3.id)).toBe(true);
  });

  it('converges identically in projectGraph and mergeEvents when intra-batch EdgeCreated precedes NodeCreated', () => {
    const graphId = createGraphId();
    const base = unwrap(createGraph(graphId, 'causal-test'));
    const batchId = asBatchId('batch:causal-order');
    const sourceId = createNodeId();
    const targetId = createNodeId();
    const edgeId = createEdgeId();
    const timestamp = createInstant();

    const edgeEvent: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: asEventId('00000000-0000-7000-8000-000000000001'),
      id: edgeId,
      source: sourceId,
      target: targetId,
      properties: new Map(),
      timestamp,
      deviceId: sessionDeviceId,
      batchId,
    };
    const sourceEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: asEventId('00000000-0000-7000-8000-000000000002'),
      id: sourceId,
      properties: new Map(),
      timestamp,
      deviceId: sessionDeviceId,
      batchId,
    };
    const targetEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: asEventId('00000000-0000-7000-8000-000000000003'),
      id: targetId,
      properties: new Map(),
      timestamp,
      deviceId: sessionDeviceId,
      batchId,
    };

    const events: readonly GraphEvent[] = [edgeEvent, sourceEvent, targetEvent];
    const projected = unwrap(projectGraph(events, base));
    const merged = mergeEvents(createMergeState(), base, events);

    expect(projected.nodes.has(sourceId)).toBe(true);
    expect(projected.nodes.has(targetId)).toBe(true);
    expect(projected.edges.has(edgeId)).toBe(true);
    expect(merged.graph.nodes.size).toBe(projected.nodes.size);
    expect(merged.graph.edges.size).toBe(projected.edges.size);
    expect(merged.graph.revision).toBe(projected.revision);
  });
});
