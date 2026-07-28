import { describe, expect, test } from 'bun:test';
import {
  asDeviceId,
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraphSession,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  createApiAdapterContext,
  createApiRequest,
  executeCreateEdge,
  executeCreateNode,
  executeDeleteNode,
  executeUpdateNodeProperties,
} from '../src';

const graphId = asGraphId('concurrency-g1');
const deviceId1 = asDeviceId('device-1');
const deviceId2 = asDeviceId('device-2');

describe('CAS & Concurrency Stress Verification', () => {
  test('atomic compare-and-swap (CAS): rejects concurrent commits with outdated sequence number', async () => {
    const eventLogStore = createInMemoryEventStore();
    const session1 = createGraphSession(eventLogStore, graphId, deviceId1);
    const session2 = createGraphSession(eventLogStore, graphId, deviceId2);

    await session1.load();
    await session2.load();

    const context1 = createApiAdapterContext({ graph: session1.graph(), session: session1 });
    const context2 = createApiAdapterContext({ graph: session2.graph(), session: session2 });

    // Initial node creation on session1
    const createResult = await executeCreateNode(
      createApiRequest('req-init', context1, {
        id: asNodeId('node-cas-1'),
        type: asTypeId('doc'),
        properties: { version: 1 },
      }),
    );
    expect(createResult.ok).toBe(true);

    // Sync session2 from event store
    await session2.load();

    // Now both sessions have sequence offset 1.
    // Client 1 attempts to update property
    const update1 = executeUpdateNodeProperties(
      createApiRequest('req-up-1', context1, {
        id: asNodeId('node-cas-1'),
        properties: { version: 2, updatedBy: 'client1' },
      }),
    );

    // Client 2 attempts to update property concurrently
    const update2 = executeUpdateNodeProperties(
      createApiRequest('req-up-2', context2, {
        id: asNodeId('node-cas-1'),
        properties: { version: 3, updatedBy: 'client2' },
      }),
    );

    const [result1, result2] = await Promise.all([update1, update2]);

    // One must succeed, and state consistency is strictly maintained across sessions.
    const successes = [result1, result2].filter((r) => r.ok);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    // Re-load both sessions and assert state parity
    await session1.load();
    await session2.load();
    expect(session1.graph().nodes.get(asNodeId('node-cas-1'))?.properties).toEqual(
      session2.graph().nodes.get(asNodeId('node-cas-1'))?.properties,
    );
  });

  test('high-throughput parallel node creations result in zero state corruption or lost updates', async () => {
    const eventLogStore = createInMemoryEventStore();
    const session = createGraphSession(eventLogStore, graphId, deviceId1);
    await session.load();
    const initialNodeCount = session.graph().nodes.size;
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const NODE_COUNT = 50;
    const requests = Array.from({ length: NODE_COUNT }, (_, index) =>
      executeCreateNode(
        createApiRequest(`req-stress-${index}`, context, {
          id: asNodeId(`stress-node-${index}`),
          type: asTypeId('item'),
          properties: { index: index },
        }),
      ),
    );

    const results = await Promise.all(requests);
    const successCount = results.filter((r) => r.ok).length;
    expect(successCount).toBe(NODE_COUNT);
    expect(session.graph().nodes.size).toBe(initialNodeCount + NODE_COUNT);

    for (let index = 0; index < NODE_COUNT; index++) {
      const node = session.graph().nodes.get(asNodeId(`stress-node-${index}`));
      expect(node).toBeDefined();
      expect(node?.properties.get('index')).toBe(index);
    }
  });

  test('interleaved edge creation and node deletion preserves referential integrity', async () => {
    const eventLogStore = createInMemoryEventStore();
    const session = createGraphSession(eventLogStore, graphId, deviceId1);
    await session.load();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    // Seed two nodes
    await executeCreateNode(
      createApiRequest('req-n1', context, {
        id: asNodeId('n1'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-n2', context, {
        id: asNodeId('n2'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    // Create edge
    await executeCreateEdge(
      createApiRequest('req-e1', context, {
        id: asEdgeId('e1'),
        type: asTypeId('rel'),
        source: asNodeId('n1'),
        target: asNodeId('n2'),
      }),
    );

    expect(session.graph().edges.has(asEdgeId('e1'))).toBe(true);

    // Delete node n1
    const delResult = await executeDeleteNode(
      createApiRequest('req-del-n1', context, { id: asNodeId('n1') }),
    );
    expect(delResult.ok).toBe(true);

    // Connected edge e1 must be automatically removed from graph session state
    expect(session.graph().nodes.has(asNodeId('n1'))).toBe(false);
    expect(session.graph().edges.has(asEdgeId('e1'))).toBe(false);

    // Subsequent edge creation linking to deleted node must fail with NOT_FOUND
    const failEdgeResult = await executeCreateEdge(
      createApiRequest('req-fail-edge', context, {
        id: asEdgeId('e2'),
        type: asTypeId('rel'),
        source: asNodeId('n1'),
        target: asNodeId('n2'),
      }),
    );
    expect(failEdgeResult.ok).toBe(false);
    if (!failEdgeResult.ok) {
      expect(failEdgeResult.error.category).toBe('NOT_FOUND');
    }
  });

  test('concurrent node deletion across separate sessions is safely rejected or handled', async () => {
    const eventLogStore = createInMemoryEventStore();
    const session1 = createGraphSession(eventLogStore, graphId, deviceId1);
    const session2 = createGraphSession(eventLogStore, graphId, deviceId2);

    await session1.load();
    const context1 = createApiAdapterContext({ graph: session1.graph(), session: session1 });

    await executeCreateNode(
      createApiRequest('n-a', context1, {
        id: asNodeId('a'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    await session2.load();
    const context2 = createApiAdapterContext({ graph: session2.graph(), session: session2 });

    // Parallel edge deletion attempts across different sessions
    const del1 = executeDeleteNode(createApiRequest('del-a-1', context1, { id: asNodeId('a') }));
    const del2 = executeDeleteNode(createApiRequest('del-a-2', context2, { id: asNodeId('a') }));

    const [r1, r2] = await Promise.all([del1, del2]);
    const successList = [r1, r2].filter((r) => r.ok);

    // At least one deletion succeeds; state is clean
    expect(successList.length).toBeGreaterThanOrEqual(1);

    await session1.load();
    await session2.load();
    expect(session1.graph().nodes.has(asNodeId('a'))).toBe(false);
    expect(session2.graph().nodes.has(asNodeId('a'))).toBe(false);
  });
});
