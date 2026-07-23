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
    const req = createApiRequest('req-1', context, { id: asNodeId('n1') });

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0].id).toBe(asNodeId('n1'));
    }
  });

  test('executeNodeQuery direct lookup missing ID returns NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-2', context, { id: asNodeId('non-existent') });

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeNodeQuery filters by type', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-3', context, { type: asTypeId('doc') });

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(2);
    }
  });

  test('executeEdgeQuery direct lookup by ID returns edge', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-4', context, { id: asEdgeId('e1') });

    const res = executeEdgeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0].id).toBe(asEdgeId('e1'));
    }
  });

  test('executePropertyLookup returns entity properties', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-5', context, { entityId: asNodeId('n1') });

    const res = executePropertyLookup(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.properties.title).toBe('Doc 1');
    }
  });

  test('executePropertyLookup with key returns specified property or NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const reqFound = createApiRequest('req-6', context, {
      entityId: asNodeId('n1'),
      propertyKey: 'title',
    });
    const reqMissing = createApiRequest('req-7', context, {
      entityId: asNodeId('n1'),
      propertyKey: 'missing',
    });

    const resFound = executePropertyLookup(reqFound);
    expect(resFound.ok).toBe(true);
    if (resFound.ok) {
      expect(resFound.value.properties.title).toBe('Doc 1');
    }

    const resMissing = executePropertyLookup(reqMissing);
    expect(resMissing.ok).toBe(false);
    if (!resMissing.ok) {
      expect(resMissing.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeGraphTraversal safely handles cycles and returns connected nodes/edges', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-8', context, {
      startNodeIds: [asNodeId('n1')],
      maxDepth: 5,
    });

    const res = executeGraphTraversal(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.nodes).toHaveLength(2);
      expect(res.value.edges).toHaveLength(2);
    }
  });

  test('executeGraphTraversal fails with VALIDATION_ERROR on empty startNodeIds', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-9', context, { startNodeIds: [] });

    const res = executeGraphTraversal(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('VALIDATION_ERROR');
    }
  });

  test('executeGraphTraversal fails with RESOURCE_EXHAUSTED when exceeding cost limit', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({
      graph,
      limits: { maxQueryCost: 1, maxQueryDepth: 10 },
    });
    const req = createApiRequest('req-10', context, {
      startNodeIds: [asNodeId('n1')],
      maxCost: 1,
    });

    const res = executeGraphTraversal(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('RESOURCE_EXHAUSTED');
    }
  });

  test('executeNodeQuery enforces tenant isolation when authContext has tenantId', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });
    const req = createApiRequest('req-11', context, {});

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(2);
      expect(res.value.every((n) => n.properties.tenantId === 't1')).toBe(true);
    }
  });
});
