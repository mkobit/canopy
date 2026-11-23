import { describe, expect, test } from 'bun:test';
import {
  asActorId,
  asCommitSeq,
  asDeviceId,
  asGraphId,
  asHlcTimestamp,
  asInstant,
  asNodeId,
  asPrincipalId,
  createEdgeId,
  createEventId,
  createGraphSession,
  createInstant,
  createMergeState,
  createNodeId,
  mergeEvents,
  ok,
  ZERO_COMMIT_SEQ,
  type EventLogStore,
  type GraphEvent,
} from './index';

function createMemoryLog(): EventLogStore {
  const eventsCell = { current: [] as readonly GraphEvent[] };
  return {
    appendEvents: async (_graphId, events) => {
      eventsCell.current = [...eventsCell.current, ...events];
      return ok(undefined);
    },
    getEvents: async () => ok(eventsCell.current),
  };
}

describe('GraphSession consistency, provenance, and CAS', () => {
  const graphId = asGraphId('0192b1a0-0000-7000-8000-000000000010');
  const deviceId = asDeviceId('0192b1a0-0000-7000-8000-000000000020');
  const altDeviceId = asDeviceId('0192b1a0-0000-7000-8000-000000000021');

  test('stamps hlcTimestamp, commitSeq, principalId, actorId, actorKind, and deviceId', async () => {
    const log = createMemoryLog();
    const session = createGraphSession(log, graphId, deviceId, {
      principalId: asPrincipalId('principal:mike'),
      actorId: asActorId('actor:mike'),
      actorKind: 'user',
    });

    const nodeId = createNodeId();
    const commit1 = await session.commit([
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeId,
        properties: new Map([['title', 'First']]),
        timestamp: createInstant(),
        deviceId,
      },
    ]);

    expect(commit1.ok).toBe(true);
    if (!commit1.ok) return;

    expect(commit1.value.commitSeq).toBe(asCommitSeq(1));
    expect(session.headCommitSeq()).toBe(asCommitSeq(1));
    expect(session.entitySeqs().get(nodeId)).toBe(asCommitSeq(1));
    const event = commit1.value.events[0];
    expect(event?.commitSeq).toBe(asCommitSeq(1));
    expect(event?.hlcTimestamp).toBe(commit1.value.hlcTimestamp);
    expect(event?.principalId).toBe(asPrincipalId('principal:mike'));
    expect(event?.actorId).toBe(asActorId('actor:mike'));
    expect(event?.actorKind).toBe('user');
    expect(event?.deviceId).toBe(deviceId);

    const commit2 = await session.commit(
      [
        {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: nodeId,
          changes: new Map([['title', 'Second']]),
          timestamp: createInstant(),
          deviceId,
        },
      ],
      {
        provenance: {
          principalId: asPrincipalId('principal:agent'),
          actorId: asActorId('actor:planner'),
          actorKind: 'agent',
          deviceId: altDeviceId,
        },
      },
    );

    expect(commit2.ok).toBe(true);
    if (!commit2.ok) return;
    expect(commit2.value.commitSeq).toBe(asCommitSeq(2));
    expect(commit2.value.events[0]?.deviceId).toBe(altDeviceId);
    expect(commit2.value.events[0]?.principalId).toBe(asPrincipalId('principal:agent'));
    expect(commit2.value.events[0]?.actorKind).toBe('agent');
  });

  test('Entity CAS rejects conflicting same-entity writes while allowing disjoint writes', async () => {
    const log = createMemoryLog();
    const session = createGraphSession(log, graphId, deviceId);
    const nodeA = createNodeId();
    const nodeB = createNodeId();

    const createResult = await session.commit([
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeA,
        properties: new Map([['status', 'open']]),
        timestamp: createInstant(),
        deviceId,
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: nodeB,
        properties: new Map([['status', 'open']]),
        timestamp: createInstant(),
        deviceId,
      },
    ]);
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;
    const seq1 = createResult.value.commitSeq;

    // Claim nodeA at seq1
    const claimA = await session.commit(
      [
        {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: nodeA,
          changes: new Map([['status', 'claimed']]),
          timestamp: createInstant(),
          deviceId,
        },
      ],
      { precondition: { mode: 'entity-cas', expectedEntitySeq: new Map([[nodeA, seq1]]) } },
    );
    expect(claimA.ok).toBe(true);

    // Concurrent claim on nodeA with stale seq1 fails
    const staleA = await session.commit(
      [
        {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: nodeA,
          changes: new Map([['status', 'stolen']]),
          timestamp: createInstant(),
          deviceId,
        },
      ],
      { precondition: { mode: 'entity-cas', expectedEntitySeq: new Map([[nodeA, seq1]]) } },
    );
    expect(staleA.ok).toBe(false);
    if (!staleA.ok) {
      expect(staleA.error.kind).toBe('concurrency-conflict');
    }

    // Disjoint write on nodeB with seq1 still succeeds
    const updateB = await session.commit(
      [
        {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: nodeB,
          changes: new Map([['status', 'in_progress']]),
          timestamp: createInstant(),
          deviceId,
        },
      ],
      { precondition: { mode: 'entity-cas', expectedEntitySeq: new Map([[nodeB, seq1]]) } },
    );
    expect(updateB.ok).toBe(true);
  });

  test('NodeDeleted advances entitySeq for cascade-deleted edges and Graph CAS checks head', async () => {
    const log = createMemoryLog();
    const session = createGraphSession(log, graphId, deviceId);
    const n1 = createNodeId();
    const n2 = createNodeId();
    const edgeId = createEdgeId();

    const c1 = await session.commit([
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: n1,
        properties: new Map(),
        timestamp: createInstant(),
        deviceId,
      },
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: n2,
        properties: new Map(),
        timestamp: createInstant(),
        deviceId,
      },
      {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: edgeId,
        source: n1,
        target: n2,
        properties: new Map(),
        timestamp: createInstant(),
        deviceId,
      },
    ]);
    expect(c1.ok).toBe(true);
    if (!c1.ok) return;

    const c2 = await session.commit([
      {
        type: 'NodeDeleted',
        eventId: createEventId(),
        id: n1,
        timestamp: createInstant(),
        deviceId,
      },
    ]);
    expect(c2.ok).toBe(true);
    if (!c2.ok) return;

    expect(session.entitySeqs().get(edgeId)).toBe(c2.value.commitSeq);

    const staleGraphCas = await session.commit([], {
      precondition: { mode: 'graph-cas', expectedGraphSeq: c1.value.commitSeq },
    });
    expect(staleGraphCas.ok).toBe(false);
    if (!staleGraphCas.ok) {
      expect(staleGraphCas.error.kind).toBe('concurrency-conflict');
    }
  });

  test('readGraph enforces minCommitSeq, atCommitSeq, atTimestamp, and linearizable', async () => {
    const log = createMemoryLog();
    const session = createGraphSession(log, graphId, deviceId);
    const n1 = createNodeId();

    // Start waiting for commitSeq 1 before commit lands
    const pendingRead = session.readGraph({ minCommitSeq: asCommitSeq(1), timeoutMs: 2000 });

    const c1 = await session.commit([
      {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: n1,
        properties: new Map([['v', 1]]),
        timestamp: asInstant('2026-01-01T00:00:01.000Z'),
        deviceId,
      },
    ]);
    expect(c1.ok).toBe(true);

    const read1 = await pendingRead;
    expect(read1.ok).toBe(true);
    if (!read1.ok) return;
    expect(read1.value.commitSeq).toBe(asCommitSeq(1));
    expect(read1.value.graph.nodes.get(n1)?.properties.get('v')).toBe(1);

    const c2 = await session.commit([
      {
        type: 'NodePropertiesUpdated',
        eventId: createEventId(),
        id: n1,
        changes: new Map([['v', 2]]),
        timestamp: asInstant('2026-01-01T00:00:02.000Z'),
        deviceId,
      },
    ]);
    expect(c2.ok).toBe(true);

    // Point-in-time at commitSeq 0 and 1
    const snap0 = await session.readGraph({ atCommitSeq: ZERO_COMMIT_SEQ });
    expect(snap0.ok).toBe(true);
    if (snap0.ok) expect(snap0.value.graph.nodes.has(n1)).toBe(false);

    const snap1 = await session.readGraph({ atCommitSeq: asCommitSeq(1) });
    expect(snap1.ok).toBe(true);
    if (snap1.ok) expect(snap1.value.graph.nodes.get(n1)?.properties.get('v')).toBe(1);

    const snapMissing = await session.readGraph({ atCommitSeq: asCommitSeq(99) });
    expect(snapMissing.ok).toBe(false);
    if (!snapMissing.ok) expect(snapMissing.error.kind).toBe('not-found');

    const timeoutRead = await session.readGraph({ minCommitSeq: asCommitSeq(99), timeoutMs: 10 });
    expect(timeoutRead.ok).toBe(false);
    if (!timeoutRead.ok) expect(timeoutRead.error.kind).toBe('consistency-timeout');

    const conflictTargets = await session.readGraph({
      atCommitSeq: asCommitSeq(1),
      atTimestamp: asInstant('2026-01-01T00:00:01.000Z'),
    });
    expect(conflictTargets.ok).toBe(false);
    if (!conflictTargets.ok) expect(conflictTargets.error.kind).toBe('validation');

    const lin = await session.readGraph({ linearizable: true });
    expect(lin.ok).toBe(true);
    if (lin.ok) expect(lin.value.commitSeq).toBe(asCommitSeq(2));
  });

  test('mergeEvents resolves property LWW by hlcTimestamp regardless of arrival order', () => {
    const nodeId = asNodeId('0192b1a0-0000-7000-8000-000000000099');
    const hlcLow = asHlcTimestamp('1700000001000:000000:actor:a');
    const hlcHigh = asHlcTimestamp('1700000002000:000000:actor:b');
    expect(hlcLow.ok && hlcHigh.ok).toBe(true);
    if (!hlcLow.ok || !hlcHigh.ok) return;

    const createEvent: GraphEvent = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: nodeId,
      properties: new Map([['title', 'init']]),
      timestamp: asInstant('2026-01-01T00:00:00.000Z'),
      deviceId,
      hlcTimestamp: hlcLow.value,
    };
    const winnerEvent: GraphEvent = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: nodeId,
      changes: new Map([['title', 'winner-hlc']]),
      // Wall-clock timestamp is earlier, but HLC is higher
      timestamp: asInstant('2025-12-31T23:59:59.000Z'),
      deviceId,
      hlcTimestamp: hlcHigh.value,
    };
    const loserEvent: GraphEvent = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: nodeId,
      changes: new Map([['title', 'loser-hlc']]),
      timestamp: asInstant('2026-01-02T00:00:00.000Z'),
      deviceId: altDeviceId,
      hlcTimestamp: hlcLow.value,
    };

    const session = createGraphSession(createMemoryLog(), graphId, deviceId);
    const mergedForward = mergeEvents(createMergeState(), session.graph(), [
      createEvent,
      winnerEvent,
      loserEvent,
    ]);
    const mergedReverse = mergeEvents(createMergeState(), session.graph(), [
      createEvent,
      loserEvent,
      winnerEvent,
    ]);

    expect(mergedForward.graph.nodes.get(nodeId)?.properties.get('title')).toBe('winner-hlc');
    expect(mergedReverse.graph.nodes.get(nodeId)?.properties.get('title')).toBe('winner-hlc');
  });
});
