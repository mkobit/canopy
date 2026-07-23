import { describe, expect, test } from 'bun:test';
import {
  asDeviceId,
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createGraphSession,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  createApiAdapterContext,
  createApiRequest,
  executeCreateEdge,
  executeCreateNode,
  executeDeleteEdge,
  executeDeleteNode,
  executeUpdateNodeProperties,
} from '../src';

const graphId = asGraphId('g1');
const deviceId = asDeviceId('device-1');

const setupSessionContext = async () => {
  const eventLogStore = createInMemoryEventStore();
  const session = createGraphSession(eventLogStore, graphId, deviceId);
  await session.load();
  return { session, eventLogStore };
};

describe('Mutation execution handlers', () => {
  test('fails if session is missing in ApiAdapterContext', async () => {
    const graph = createGraph(graphId, 'test').value;
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-1', context, {
      type: asTypeId('doc'),
      properties: { title: 'Test' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('VALIDATION_ERROR');
      expect(res.error.message).toContain('GraphSession is required');
    }
  });

  test('executeCreateNode successfully creates a node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const req = createApiRequest('req-2', context, {
      id: asNodeId('n1'),
      type: asTypeId('doc'),
      properties: { title: 'My Document', tenantId: 't1' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.id).toBe('n1');
      expect(res.value.properties.title).toBe('My Document');
    }
    expect(session.graph().nodes.has(asNodeId('n1'))).toBe(true);
  });

  test('executeCreateNode enforces tenantId match when authContext is set', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't1' },
    });
    const req = createApiRequest('req-3', context, {
      id: asNodeId('n2'),
      type: asTypeId('doc'),
      properties: { title: 'Doc', tenantId: 't2' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('FORBIDDEN');
    }
  });

  test('executeCreateNode automatically attaches tenantId when authContext is active', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't1' },
    });
    const req = createApiRequest('req-3b', context, {
      id: asNodeId('n2b'),
      type: asTypeId('doc'),
      properties: { title: 'Doc' },
    });

    const res = await executeCreateNode(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.properties.tenantId).toBe('t1');
    }
  });

  test('executeCreateNode rejects duplicate node ID with CONCURRENCY_CONFLICT', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-dup-1', context, {
        id: asNodeId('dup1'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    const dupRes = await executeCreateNode(
      createApiRequest('req-dup-2', context, {
        id: asNodeId('dup1'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    expect(dupRes.ok).toBe(false);
    if (!dupRes.ok) {
      expect(dupRes.error.category).toBe('CONCURRENCY_CONFLICT');
    }
  });

  test('executeUpdateNodeProperties updates existing node properties', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-4', context, {
        id: asNodeId('n3'),
        type: asTypeId('doc'),
        properties: { title: 'Original Title' },
      }),
    );

    const reqUpdate = createApiRequest('req-5', context, {
      id: asNodeId('n3'),
      properties: { title: 'Updated Title' },
    });

    const resUpdate = await executeUpdateNodeProperties(reqUpdate);
    expect(resUpdate.ok).toBe(true);
    if (resUpdate.ok) {
      expect(resUpdate.value.properties.title).toBe('Updated Title');
    }
  });

  test('executeUpdateNodeProperties fails with NOT_FOUND for non-existent node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const req = createApiRequest('req-6', context, {
      id: asNodeId('missing'),
      properties: { title: 'Title' },
    });

    const res = await executeUpdateNodeProperties(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeUpdateNodeProperties fails with NOT_FOUND when tenantId does not match', async () => {
    const { session } = await setupSessionContext();
    const context1 = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't1' },
    });

    await executeCreateNode(
      createApiRequest('req-tenant-setup', context1, {
        id: asNodeId('tenant-node'),
        type: asTypeId('doc'),
        properties: { title: 'Title' },
      }),
    );

    const context2 = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't2' },
    });

    const res = await executeUpdateNodeProperties(
      createApiRequest('req-tenant-update', context2, {
        id: asNodeId('tenant-node'),
        properties: { title: 'Hacked Title' },
      }),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeCreateEdge connects source and target nodes', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-7', context, {
        id: asNodeId('src'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-8', context, {
        id: asNodeId('tgt'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    const reqEdge = createApiRequest('req-9', context, {
      id: asEdgeId('e1'),
      type: asTypeId('links'),
      source: asNodeId('src'),
      target: asNodeId('tgt'),
      properties: { weight: 10 },
    });

    const resEdge = await executeCreateEdge(reqEdge);
    expect(resEdge.ok).toBe(true);
    if (resEdge.ok) {
      expect(resEdge.value.id).toBe('e1');
      expect(resEdge.value.source).toBe('src');
      expect(resEdge.value.target).toBe('tgt');
    }
  });

  test('executeCreateEdge fails if source node does not exist', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const reqEdge = createApiRequest('req-10', context, {
      type: asTypeId('links'),
      source: asNodeId('missing-src'),
      target: asNodeId('tgt'),
    });

    const resEdge = await executeCreateEdge(reqEdge);
    expect(resEdge.ok).toBe(false);
    if (!resEdge.ok) {
      expect(resEdge.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeCreateEdge fails if tenantId does not match source or target node', async () => {
    const { session } = await setupSessionContext();
    const contextT1 = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't1' },
    });

    await executeCreateNode(
      createApiRequest('req-edge-t1', contextT1, {
        id: asNodeId('src-t1'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    const contextT2 = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't2' },
    });

    await executeCreateNode(
      createApiRequest('req-edge-t2', contextT2, {
        id: asNodeId('tgt-t2'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    const resCross = await executeCreateEdge(
      createApiRequest('req-edge-cross', contextT1, {
        type: asTypeId('links'),
        source: asNodeId('src-t1'),
        target: asNodeId('tgt-t2'),
      }),
    );

    expect(resCross.ok).toBe(false);
    if (!resCross.ok) {
      expect(resCross.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeDeleteEdge removes an edge', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-11', context, {
        id: asNodeId('n11'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-12', context, {
        id: asNodeId('n12'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateEdge(
      createApiRequest('req-13', context, {
        id: asEdgeId('e13'),
        type: asTypeId('links'),
        source: asNodeId('n11'),
        target: asNodeId('n12'),
      }),
    );

    const reqDel = createApiRequest('req-14', context, { id: asEdgeId('e13') });
    const resDel = await executeDeleteEdge(reqDel);

    expect(resDel.ok).toBe(true);
    if (resDel.ok) {
      expect(resDel.value.success).toBe(true);
    }
    expect(session.graph().edges.has(asEdgeId('e13'))).toBe(false);
  });

  test('executeDeleteEdge fails with NOT_FOUND for non-existent edge', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const reqDel = createApiRequest('req-del-missing', context, { id: asEdgeId('missing-edge') });
    const resDel = await executeDeleteEdge(reqDel);

    expect(resDel.ok).toBe(false);
    if (!resDel.ok) {
      expect(resDel.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeDeleteNode removes node and connected edges', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    await executeCreateNode(
      createApiRequest('req-15', context, {
        id: asNodeId('n15'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateNode(
      createApiRequest('req-16', context, {
        id: asNodeId('n16'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );
    await executeCreateEdge(
      createApiRequest('req-17', context, {
        id: asEdgeId('e17'),
        type: asTypeId('links'),
        source: asNodeId('n15'),
        target: asNodeId('n16'),
      }),
    );

    const reqDelNode = createApiRequest('req-18', context, { id: asNodeId('n15') });
    const resDelNode = await executeDeleteNode(reqDelNode);

    expect(resDelNode.ok).toBe(true);
    if (resDelNode.ok) {
      expect(resDelNode.value.success).toBe(true);
      expect(resDelNode.value.affectedEventsCount).toBe(2);
    }
    expect(session.graph().nodes.has(asNodeId('n15'))).toBe(false);
    expect(session.graph().edges.has(asEdgeId('e17'))).toBe(false);
  });

  test('executeDeleteNode fails with NOT_FOUND for non-existent node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const reqDelNode = createApiRequest('req-del-node-missing', context, {
      id: asNodeId('missing-node'),
    });
    const resDelNode = await executeDeleteNode(reqDelNode);

    expect(resDelNode.ok).toBe(false);
    if (!resDelNode.ok) {
      expect(resDelNode.error.category).toBe('NOT_FOUND');
    }
  });
});
