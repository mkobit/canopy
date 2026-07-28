import { describe, expect, test } from 'bun:test';
import {
  asDeviceId,
  asEdgeId,
  asGraphId,
  asNodeId,
  asTypeId,
  createGraph,
  createGraphSession,
  unwrap,
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
    const graph = unwrap(createGraph(graphId, 'test'));
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-1', context, {
      type: asTypeId('doc'),
      properties: { title: 'Test' },
    });

    const result = await executeCreateNode(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('GraphSession is required');
    }
  });

  test('executeCreateNode successfully creates a node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const request = createApiRequest('req-2', context, {
      id: asNodeId('n1'),
      type: asTypeId('doc'),
      properties: { title: 'My Document', tenantId: 't1' },
    });

    const result = await executeCreateNode(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe(asNodeId('n1'));
      expect(result.value.properties.title).toBe('My Document');
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
    const request = createApiRequest('req-3', context, {
      id: asNodeId('n2'),
      type: asTypeId('doc'),
      properties: { title: 'Doc', tenantId: 't2' },
    });

    const result = await executeCreateNode(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('FORBIDDEN');
    }
  });

  test('executeCreateNode automatically attaches tenantId when authContext is active', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({
      graph: session.graph(),
      session,
      authContext: { tenantId: 't1' },
    });
    const request = createApiRequest('req-3b', context, {
      id: asNodeId('n2b'),
      type: asTypeId('doc'),
      properties: { title: 'Doc' },
    });

    const result = await executeCreateNode(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties.tenantId).toBe('t1');
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

    const dupResult = await executeCreateNode(
      createApiRequest('req-dup-2', context, {
        id: asNodeId('dup1'),
        type: asTypeId('doc'),
        properties: {},
      }),
    );

    expect(dupResult.ok).toBe(false);
    if (!dupResult.ok) {
      expect(dupResult.error.category).toBe('CONCURRENCY_CONFLICT');
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

    const requestUpdate = createApiRequest('req-5', context, {
      id: asNodeId('n3'),
      properties: { title: 'Updated Title' },
    });

    const resultUpdate = await executeUpdateNodeProperties(requestUpdate);
    expect(resultUpdate.ok).toBe(true);
    if (resultUpdate.ok) {
      expect(resultUpdate.value.properties.title).toBe('Updated Title');
    }
  });

  test('executeUpdateNodeProperties fails with NOT_FOUND for non-existent node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const request = createApiRequest('req-6', context, {
      id: asNodeId('missing'),
      properties: { title: 'Title' },
    });

    const result = await executeUpdateNodeProperties(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('NOT_FOUND');
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

    const result = await executeUpdateNodeProperties(
      createApiRequest('req-tenant-update', context2, {
        id: asNodeId('tenant-node'),
        properties: { title: 'Hacked Title' },
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('NOT_FOUND');
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

    const requestEdge = createApiRequest('req-9', context, {
      id: asEdgeId('e1'),
      type: asTypeId('links'),
      source: asNodeId('src'),
      target: asNodeId('tgt'),
      properties: { weight: 10 },
    });

    const resultEdge = await executeCreateEdge(requestEdge);
    expect(resultEdge.ok).toBe(true);
    if (resultEdge.ok) {
      expect(resultEdge.value.id).toBe(asEdgeId('e1'));
      expect(resultEdge.value.source).toBe(asNodeId('src'));
      expect(resultEdge.value.target).toBe(asNodeId('tgt'));
    }
  });

  test('executeCreateEdge fails if source node does not exist', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const requestEdge = createApiRequest('req-10', context, {
      type: asTypeId('links'),
      source: asNodeId('missing-src'),
      target: asNodeId('tgt'),
    });

    const resultEdge = await executeCreateEdge(requestEdge);
    expect(resultEdge.ok).toBe(false);
    if (!resultEdge.ok) {
      expect(resultEdge.error.category).toBe('NOT_FOUND');
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

    const resultCross = await executeCreateEdge(
      createApiRequest('req-edge-cross', contextT1, {
        type: asTypeId('links'),
        source: asNodeId('src-t1'),
        target: asNodeId('tgt-t2'),
      }),
    );

    expect(resultCross.ok).toBe(false);
    if (!resultCross.ok) {
      expect(resultCross.error.category).toBe('NOT_FOUND');
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

    const requestDel = createApiRequest('req-14', context, { id: asEdgeId('e13') });
    const resultDel = await executeDeleteEdge(requestDel);

    expect(resultDel.ok).toBe(true);
    if (resultDel.ok) {
      expect(resultDel.value.success).toBe(true);
    }
    expect(session.graph().edges.has(asEdgeId('e13'))).toBe(false);
  });

  test('executeDeleteEdge fails with NOT_FOUND for non-existent edge', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });
    const requestDel = createApiRequest('req-del-missing', context, {
      id: asEdgeId('missing-edge'),
    });
    const resultDel = await executeDeleteEdge(requestDel);

    expect(resultDel.ok).toBe(false);
    if (!resultDel.ok) {
      expect(resultDel.error.category).toBe('NOT_FOUND');
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

    const requestDelNode = createApiRequest('req-18', context, { id: asNodeId('n15') });
    const resultDelNode = await executeDeleteNode(requestDelNode);

    expect(resultDelNode.ok).toBe(true);
    if (resultDelNode.ok) {
      expect(resultDelNode.value.success).toBe(true);
      expect(resultDelNode.value.affectedEventsCount).toBe(2);
    }
    expect(session.graph().nodes.has(asNodeId('n15'))).toBe(false);
    expect(session.graph().edges.has(asEdgeId('e17'))).toBe(false);
  });

  test('executeDeleteNode fails with NOT_FOUND for non-existent node', async () => {
    const { session } = await setupSessionContext();
    const context = createApiAdapterContext({ graph: session.graph(), session });

    const requestDelNode = createApiRequest('req-del-node-missing', context, {
      id: asNodeId('missing-node'),
    });
    const resultDelNode = await executeDeleteNode(requestDelNode);

    expect(resultDelNode.ok).toBe(false);
    if (!resultDelNode.ok) {
      expect(resultDelNode.error.category).toBe('NOT_FOUND');
    }
  });
});
