import { describe, expect, test } from 'bun:test';
import {
  addEdge,
  addNode,
  asEdgeId,
  asGraphId,
  asInstant,
  asNodeId,
  asTypeId,
  createDeviceId,
  createGraph,
  unwrap,
} from '@canopy/graph';
import {
  createApiAdapterContext,
  createApiRequest,
  executeEdgeQuery,
  executeGraphTraversal,
  executeNodeQuery,
  executePropertyLookup,
} from '../src';

const deviceId = createDeviceId();

const setupTestGraph = () => {
  const node1 = {
    id: asNodeId('n1'),
    type: asTypeId('doc'),
    properties: new Map([
      ['title', 'Doc 1'],
      ['tenantId', 't1'],
    ]),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };
  const node2 = {
    id: asNodeId('n2'),
    type: asTypeId('doc'),
    properties: new Map([
      ['title', 'Doc 2'],
      ['tenantId', 't1'],
    ]),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };
  const node3 = {
    id: asNodeId('n3'),
    type: asTypeId('tag'),
    properties: new Map([
      ['name', 'Tag 1'],
      ['tenantId', 't2'],
    ]),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };
  const edge1 = {
    id: asEdgeId('e1'),
    type: asTypeId('links'),
    source: node1.id,
    target: node2.id,
    properties: new Map([['weight', 1]]),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };
  const cycleEdge = {
    id: asEdgeId('e2'),
    type: asTypeId('links'),
    source: node2.id,
    target: node1.id,
    properties: new Map(),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };

  let g = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
  g = unwrap(addNode(g, node1, { deviceId })).graph;
  g = unwrap(addNode(g, node2, { deviceId })).graph;
  g = unwrap(addNode(g, node3, { deviceId })).graph;
  g = unwrap(addEdge(g, edge1, { deviceId })).graph;
  g = unwrap(addEdge(g, cycleEdge, { deviceId })).graph;
  return g;
};

describe('Query execution handlers', () => {
  test('executeNodeQuery direct lookup by ID returns node', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-1', context, { id: asNodeId('n1') });

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe(asNodeId('n1'));
    }
  });

  test('executeNodeQuery direct lookup missing ID returns NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-2', context, { id: asNodeId('non-existent') });

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeNodeQuery filters by type', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-3', context, { type: asTypeId('doc') });

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  test('executeEdgeQuery direct lookup by ID returns edge', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-4', context, { id: asEdgeId('e1') });

    const result = executeEdgeQuery(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe(asEdgeId('e1'));
    }
  });

  test('executePropertyLookup returns entity properties', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-5', context, { entityId: asNodeId('n1') });

    const result = executePropertyLookup(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties.title).toBe('Doc 1');
    }
  });

  test('executePropertyLookup with key returns specified property or NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const requestFound = createApiRequest('req-6', context, {
      entityId: asNodeId('n1'),
      propertyKey: 'title',
    });
    const requestMissing = createApiRequest('req-7', context, {
      entityId: asNodeId('n1'),
      propertyKey: 'missing',
    });

    const resultFound = executePropertyLookup(requestFound);
    expect(resultFound.ok).toBe(true);
    if (resultFound.ok) {
      expect(resultFound.value.properties.title).toBe('Doc 1');
    }

    const resultMissing = executePropertyLookup(requestMissing);
    expect(resultMissing.ok).toBe(false);
    if (!resultMissing.ok) {
      expect(resultMissing.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeGraphTraversal safely handles cycles and returns connected nodes/edges', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-8', context, {
      startNodeIds: [asNodeId('n1')],
      maxDepth: 5,
    });

    const result = executeGraphTraversal(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(2);
      expect(result.value.edges).toHaveLength(2);
    }
  });

  test('executeGraphTraversal fails with VALIDATION_ERROR on empty startNodeIds', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const request = createApiRequest('req-9', context, { startNodeIds: [] });

    const result = executeGraphTraversal(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('VALIDATION_ERROR');
    }
  });

  test('executeGraphTraversal fails with RESOURCE_EXHAUSTED when exceeding cost limit', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({
      graph,
      limits: { maxQueryCost: 1, maxQueryDepth: 10 },
    });
    const request = createApiRequest('req-10', context, {
      startNodeIds: [asNodeId('n1')],
      maxCost: 1,
    });

    const result = executeGraphTraversal(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RESOURCE_EXHAUSTED');
    }
  });

  test('executeNodeQuery enforces tenant isolation when authContext has tenantId', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });
    const request = createApiRequest('req-11', context, {});

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value.every((n) => n.properties.tenantId === 't1')).toBe(true);
    }
  });

  test('executeEdgeQuery direct lookup enforces tenant isolation', () => {
    const graph = setupTestGraph();
    const contextMatching = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });
    const contextMismatching = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't2' },
    });

    const requestMatching = createApiRequest('req-edge-tenant-1', contextMatching, {
      id: asEdgeId('e1'),
    });
    const resultMatching = executeEdgeQuery(requestMatching);
    expect(resultMatching.ok).toBe(true);
    if (resultMatching.ok) {
      expect(resultMatching.value).toHaveLength(1);
      expect(resultMatching.value[0]?.id).toBe(asEdgeId('e1'));
    }

    const requestMismatching = createApiRequest('req-edge-tenant-2', contextMismatching, {
      id: asEdgeId('e1'),
    });
    const resultMismatching = executeEdgeQuery(requestMismatching);
    expect(resultMismatching.ok).toBe(false);
    if (!resultMismatching.ok) {
      expect(resultMismatching.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeEdgeQuery scan enforces tenant isolation', () => {
    const graph = setupTestGraph();
    const contextT1 = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });
    const contextT2 = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't2' },
    });

    const resultT1 = executeEdgeQuery(createApiRequest('req-edge-scan-1', contextT1, {}));
    expect(resultT1.ok).toBe(true);
    if (resultT1.ok) {
      expect(resultT1.value).toHaveLength(2);
    }

    const resultT2 = executeEdgeQuery(createApiRequest('req-edge-scan-2', contextT2, {}));
    expect(resultT2.ok).toBe(true);
    if (resultT2.ok) {
      expect(resultT2.value).toHaveLength(0);
    }
  });

  test('executePropertyLookup enforces tenant isolation for nodes and edges', () => {
    const graph = setupTestGraph();
    const contextT1 = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });
    const contextT2 = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't2' },
    });

    // Node property lookup
    const resultNodeT1 = executePropertyLookup(
      createApiRequest('req-prop-1', contextT1, { entityId: asNodeId('n1') }),
    );
    expect(resultNodeT1.ok).toBe(true);

    const resultNodeT2 = executePropertyLookup(
      createApiRequest('req-prop-2', contextT2, { entityId: asNodeId('n1') }),
    );
    expect(resultNodeT2.ok).toBe(false);
    if (!resultNodeT2.ok) {
      expect(resultNodeT2.error.category).toBe('NOT_FOUND');
    }

    // Edge property lookup
    const resultEdgeT1 = executePropertyLookup(
      createApiRequest('req-prop-3', contextT1, { entityId: asEdgeId('e1') }),
    );
    expect(resultEdgeT1.ok).toBe(true);

    const resultEdgeT2 = executePropertyLookup(
      createApiRequest('req-prop-4', contextT2, { entityId: asEdgeId('e1') }),
    );
    expect(resultEdgeT2.ok).toBe(false);
    if (!resultEdgeT2.ok) {
      expect(resultEdgeT2.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeGraphTraversal enforces tenant isolation during BFS traversal', () => {
    let graph = setupTestGraph();
    // Add cross-tenant edge e3 from n1 (t1) to n3 (t2)
    const crossEdge = {
      id: asEdgeId('e3'),
      type: asTypeId('links'),
      source: asNodeId('n1'),
      target: asNodeId('n3'),
      properties: new Map(),
      metadata: {
        created: asInstant('2026-01-01T00:00:00.000Z'),
        modified: asInstant('2026-01-01T00:00:00.000Z'),
        modifiedBy: deviceId,
      },
    };
    graph = unwrap(addEdge(graph, crossEdge, { deviceId })).graph;

    const contextT1 = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });

    // Traversal starting at n1 under t1 context should not traverse to n3 (t2)
    const requestT1 = createApiRequest('req-trav-1', contextT1, {
      startNodeIds: [asNodeId('n1')],
    });
    const resultT1 = executeGraphTraversal(requestT1);
    expect(resultT1.ok).toBe(true);
    if (resultT1.ok) {
      const nodeIds = resultT1.value.nodes.map((n) => n.id);
      expect(nodeIds).toContain(asNodeId('n1'));
      expect(nodeIds).toContain(asNodeId('n2'));
      expect(nodeIds).not.toContain(asNodeId('n3'));
    }

    // Traversal starting at n3 (t2) under t1 context should return no nodes
    const requestStartMismatch = createApiRequest('req-trav-2', contextT1, {
      startNodeIds: [asNodeId('n3')],
    });
    const resultStartMismatch = executeGraphTraversal(requestStartMismatch);
    expect(resultStartMismatch.ok).toBe(true);
    if (resultStartMismatch.ok) {
      expect(resultStartMismatch.value.nodes).toHaveLength(0);
    }
  });
});
