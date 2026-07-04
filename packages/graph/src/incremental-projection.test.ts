import { describe, it, expect, setSystemTime } from 'bun:test';
import { Temporal } from 'temporal-polyfill';
import {
  mergeEvents,
  createMergeState,
  DEFAULT_STALE_THRESHOLD_MS,
} from './incremental-projection';
import { createGraph } from './create-graph';
import {
  createGraphId,
  createNodeId,
  createEdgeId,
  asTypeId,
  createEventId,
  asDeviceId,
  createInstant,
  unwrap,
  maxEventIdForTimestamp,
  type NodeCreated,
  type NodePropertiesUpdated,
  type NodeDeleted,
  type EdgeCreated,
  type EdgeDeleted,
} from '@canopy/graph';

const deviceA = asDeviceId('00000000-0000-0000-0000-00000000000A');
const deviceB = asDeviceId('00000000-0000-0000-0000-00000000000B');

function freshGraph() {
  return unwrap(createGraph(createGraphId(), 'test-graph'));
}

/** Advances the mocked clock by `ms` and mints a real (monotonic, organically-paired) eventId + timestamp. */
function tick(ms = 1000): Readonly<{
  eventId: ReturnType<typeof createEventId>;
  timestamp: ReturnType<typeof createInstant>;
}> {
  const current = Temporal.Now.instant().add({ milliseconds: ms });
  setSystemTime(current.epochMilliseconds);
  return { eventId: createEventId(), timestamp: createInstant() };
}

describe('incremental-projection / mergeEvents', () => {
  it('applies a NodeCreated and tracks per-property writers', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const state = createMergeState();
    const id = createNodeId();
    const { eventId, timestamp } = tick();

    const event: NodeCreated = {
      type: 'NodeCreated',
      eventId,
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map([['a', '1']]),
      timestamp,
      deviceId: deviceA,
    };

    const result = mergeEvents(state, graph, [event]);
    expect(result.applied).toEqual([event]);
    expect(result.graph.nodes.get(id)?.properties.get('a')).toBe('1');
    setSystemTime();
  });

  it('applies a later-eventId property write over an earlier one regardless of arrival order', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph0 = freshGraph();
    const id = createNodeId();
    const created = tick();
    const createEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: created.eventId,
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map([['a', '0']]),
      timestamp: created.timestamp,
      deviceId: deviceA,
    };

    const earlier = tick();
    const earlierUpdate: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: earlier.eventId,
      id,
      changes: new Map([['a', 'earlier']]),
      timestamp: earlier.timestamp,
      deviceId: deviceA,
    };

    const later = tick();
    const laterUpdate: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: later.eventId,
      id,
      changes: new Map([['a', 'later']]),
      timestamp: later.timestamp,
      deviceId: deviceB,
    };

    const state0 = createMergeState();
    const r1 = mergeEvents(state0, graph0, [createEvent, laterUpdate, earlierUpdate]);
    expect(r1.graph.nodes.get(id)?.properties.get('a')).toBe('later');

    const r2 = mergeEvents(state0, graph0, [createEvent, earlierUpdate, laterUpdate]);
    expect(r2.graph.nodes.get(id)?.properties.get('a')).toBe('later');
    setSystemTime();
  });

  it('permits concurrent updates to different properties on the same node (no whole-node gating)', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const id = createNodeId();
    const created = tick();
    const createEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: created.eventId,
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map(),
      timestamp: created.timestamp,
      deviceId: deviceA,
    };

    const bWrite = tick();
    const updateB: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: bWrite.eventId,
      id,
      changes: new Map([['propB', 'b-value']]),
      timestamp: bWrite.timestamp,
      deviceId: deviceA,
    };

    const aWrite = tick();
    const updateA: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: aWrite.eventId,
      id,
      changes: new Map([['propA', 'a-value']]),
      timestamp: aWrite.timestamp,
      deviceId: deviceB,
    };

    // Apply in reverse (A before B) -- both must survive; this is exactly the
    // case where whole-node LWW gating would have dropped propB's update.
    const state = createMergeState();
    const result = mergeEvents(state, graph, [createEvent, updateA, updateB]);
    expect(result.graph.nodes.get(id)?.properties.get('propA')).toBe('a-value');
    expect(result.graph.nodes.get(id)?.properties.get('propB')).toBe('b-value');
    setSystemTime();
  });

  it('parks an EdgeCreated arriving before its endpoint, then applies it once the node arrives', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const sourceId = createNodeId();
    const targetId = createNodeId();
    const edgeId = createEdgeId();

    const sourceCreated = tick();
    const sourceEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: sourceCreated.eventId,
      id: sourceId,
      nodeType: asTypeId('test-type'),
      properties: new Map(),
      timestamp: sourceCreated.timestamp,
      deviceId: deviceA,
    };

    const edgeCreated = tick();
    const edgeEvent: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: edgeCreated.eventId,
      id: edgeId,
      edgeType: asTypeId('test-edge-type'),
      source: sourceId,
      target: targetId,
      properties: new Map(),
      timestamp: edgeCreated.timestamp,
      deviceId: deviceA,
    };

    const targetCreated = tick();
    const targetEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: targetCreated.eventId,
      id: targetId,
      nodeType: asTypeId('test-type'),
      properties: new Map(),
      timestamp: targetCreated.timestamp,
      deviceId: deviceA,
    };

    const state0 = createMergeState();
    // Edge arrives first, then source, but target is still missing -> edge stays parked.
    const r1 = mergeEvents(state0, graph, [edgeEvent, sourceEvent]);
    expect(r1.graph.edges.has(edgeId)).toBe(false);
    expect(r1.applied).toEqual([sourceEvent]);

    // Target arrives -> the parked edge drains and appears in this call's delta.
    const r2 = mergeEvents(r1.state, r1.graph, [targetEvent]);
    expect(r2.graph.edges.has(edgeId)).toBe(true);
    expect(r2.applied).toEqual([targetEvent, edgeEvent]);
    setSystemTime();
  });

  it('withholds an entire batch atomically when one sibling has an unmet dependency', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const nodeAId = createNodeId();
    const nodeBId = createNodeId();
    const edgeId = createEdgeId();
    const batchId = 'batch-1';

    const nodeACreated = tick();
    const nodeAEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: nodeACreated.eventId,
      id: nodeAId,
      nodeType: asTypeId('test-type'),
      properties: new Map(),
      timestamp: nodeACreated.timestamp,
      deviceId: deviceA,
      batchId,
    };

    const edgeCreated = tick();
    // References nodeB, which is NOT part of this batch and hasn't arrived yet.
    const edgeEvent: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: edgeCreated.eventId,
      id: edgeId,
      edgeType: asTypeId('test-edge-type'),
      source: nodeAId,
      target: nodeBId,
      properties: new Map(),
      timestamp: edgeCreated.timestamp,
      deviceId: deviceA,
      batchId,
    };

    const state0 = createMergeState();
    const r1 = mergeEvents(state0, graph, [nodeAEvent, edgeEvent]);
    // Even though nodeAEvent itself has no unmet dependency, its co-batched
    // sibling does -- the whole group is withheld, so nodeA must NOT appear.
    expect(r1.graph.nodes.has(nodeAId)).toBe(false);
    expect(r1.applied).toEqual([]);

    const nodeBCreated = tick();
    const nodeBEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: nodeBCreated.eventId,
      id: nodeBId,
      nodeType: asTypeId('test-type'),
      properties: new Map(),
      timestamp: nodeBCreated.timestamp,
      deviceId: deviceA,
    };

    const r2 = mergeEvents(r1.state, r1.graph, [nodeBEvent]);
    expect(r2.graph.nodes.has(nodeAId)).toBe(true);
    expect(r2.graph.nodes.has(nodeBId)).toBe(true);
    expect(r2.graph.edges.has(edgeId)).toBe(true);
    setSystemTime();
  });

  it('permanently tombstones a deleted node; later updates are no-ops', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const id = createNodeId();
    const created = tick();
    const createEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: created.eventId,
      id,
      nodeType: asTypeId('test-type'),
      properties: new Map([['a', 'orig']]),
      timestamp: created.timestamp,
      deviceId: deviceA,
    };

    const deleted = tick();
    const deleteEvent: NodeDeleted = {
      type: 'NodeDeleted',
      eventId: deleted.eventId,
      id,
      timestamp: deleted.timestamp,
      deviceId: deviceA,
    };

    const state0 = createMergeState();
    const r1 = mergeEvents(state0, graph, [createEvent, deleteEvent]);
    expect(r1.graph.nodes.has(id)).toBe(false);

    const laterUpdate = tick();
    const updateEvent: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: laterUpdate.eventId,
      id,
      changes: new Map([['a', 'resurrected']]),
      timestamp: laterUpdate.timestamp,
      deviceId: deviceA,
    };

    const r2 = mergeEvents(r1.state, r1.graph, [updateEvent]);
    expect(r2.graph.nodes.has(id)).toBe(false);
    setSystemTime();
  });

  it('cascades node deletion to touching edges and tombstones them too', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const sourceId = createNodeId();
    const targetId = createNodeId();
    const edgeId = createEdgeId();

    const s = tick();
    const sourceEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: s.eventId,
      id: sourceId,
      nodeType: asTypeId('t'),
      properties: new Map(),
      timestamp: s.timestamp,
      deviceId: deviceA,
    };
    const t = tick();
    const targetEvent: NodeCreated = {
      type: 'NodeCreated',
      eventId: t.eventId,
      id: targetId,
      nodeType: asTypeId('t'),
      properties: new Map(),
      timestamp: t.timestamp,
      deviceId: deviceA,
    };
    const e = tick();
    const edgeEvent: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: e.eventId,
      id: edgeId,
      edgeType: asTypeId('et'),
      source: sourceId,
      target: targetId,
      properties: new Map(),
      timestamp: e.timestamp,
      deviceId: deviceA,
    };
    const d = tick();
    const deleteSource: NodeDeleted = {
      type: 'NodeDeleted',
      eventId: d.eventId,
      id: sourceId,
      timestamp: d.timestamp,
      deviceId: deviceA,
    };

    const state0 = createMergeState();
    const r1 = mergeEvents(state0, graph, [sourceEvent, targetEvent, edgeEvent, deleteSource]);
    expect(r1.graph.edges.has(edgeId)).toBe(false);

    // A later (out-of-order-arriving) delete for the same already-cascaded edge is a no-op.
    const laterEdgeDelete = tick();
    const edgeDeleteEvent: EdgeDeleted = {
      type: 'EdgeDeleted',
      eventId: laterEdgeDelete.eventId,
      id: edgeId,
      timestamp: laterEdgeDelete.timestamp,
      deviceId: deviceA,
    };
    const r2 = mergeEvents(r1.state, r1.graph, [edgeDeleteEvent]);
    expect(r2.graph.edges.has(edgeId)).toBe(false);
    setSystemTime();
  });

  it('surfaces a stale-pending warning once a parked group exceeds the age threshold', () => {
    setSystemTime(Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds);
    const graph = freshGraph();
    const sourceId = createNodeId();
    const targetId = createNodeId();
    const edgeId = createEdgeId();

    // uuid v7 keeps an internal monotonic ratchet across calls that
    // setSystemTime cannot rewind, so a real createEventId() here could embed
    // a later timestamp than the mocked clock reports. Use a deterministic
    // eventId for this specific timestamp instead (same helper history.ts
    // uses to bound eventId-range queries).
    const edgeCreated = tick();
    const edgeEventId = maxEventIdForTimestamp(edgeCreated.timestamp);
    const edgeEvent: EdgeCreated = {
      type: 'EdgeCreated',
      eventId: edgeEventId,
      id: edgeId,
      edgeType: asTypeId('et'),
      source: sourceId,
      target: targetId,
      properties: new Map(),
      timestamp: edgeCreated.timestamp,
      deviceId: deviceA,
    };

    const state0 = createMergeState();
    const r1 = mergeEvents(state0, graph, [edgeEvent]);
    expect(r1.stale).toEqual([]);

    const muchLater = Temporal.Instant.from(edgeCreated.timestamp).add({
      milliseconds: DEFAULT_STALE_THRESHOLD_MS + 1000,
    });
    const r2 = mergeEvents(
      r1.state,
      r1.graph,
      [],
      muchLater.toString() as ReturnType<typeof createInstant>,
    );
    expect(r2.stale.length).toBe(1);
    expect(r2.stale[0]?.eventIds).toEqual([edgeEventId]);
    setSystemTime();
  });
});
