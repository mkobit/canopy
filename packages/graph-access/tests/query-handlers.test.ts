import { describe, expect, test } from 'bun:test';
import {
  addEdge,
  addNode,
  asDeviceId,
  asEdgeId,
  asGraphId,
  asInstant,
  asNodeId,
  asTypeId,
  createDeviceId,
  createGraph,
  createGraphSession,
  unwrap,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import {
  createGraphAccessContext,
  createGraphAccessRequest,
  executeCreateNode,
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
    properties: new Map([['title', 'Doc 1']]),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };
  const node2 = {
    id: asNodeId('n2'),
    type: asTypeId('doc'),
    properties: new Map([['title', 'Doc 2']]),
    metadata: {
      created: asInstant('2026-01-01T00:00:00.000Z'),
      modified: asInstant('2026-01-01T00:00:00.000Z'),
      modifiedBy: deviceId,
    },
  };
  const node3 = {
    id: asNodeId('n3'),
    type: asTypeId('tag'),
    properties: new Map([['name', 'Tag 1']]),
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
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-1', context, { id: asNodeId('n1') });

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.id).toBe(asNodeId('n1'));
  });

  test('executeNodeQuery reads the current graph from GraphSession after a commit', async () => {
    const eventLogStore = createInMemoryEventStore();
    const session = createGraphSession(
      eventLogStore,
      asGraphId('current-session-graph'),
      asDeviceId('current-session-device'),
    );
    await session.load();
    const context = createGraphAccessContext({ graph: session.graph(), session });

    const createResult = await executeCreateNode(
      createGraphAccessRequest('req-current-session-create', context, {
        id: asNodeId('current-session-node'),
        type: asTypeId('doc'),
        properties: { title: 'Committed node' },
      }),
    );
    expect(createResult.ok).toBe(true);

    const readResult = executeNodeQuery(
      createGraphAccessRequest('req-current-session-read', context, {
        id: asNodeId('current-session-node'),
      }),
    );
    expect(readResult).toEqual({
      ok: true,
      value: [
        expect.objectContaining({
          id: asNodeId('current-session-node'),
          type: asTypeId('doc'),
          properties: { title: 'Committed node' },
        }),
      ],
    });
  });

  test('executeNodeQuery direct lookup missing ID returns NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-2', context, { id: asNodeId('non-existent') });

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeNodeQuery filters by type', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-3', context, { type: asTypeId('doc') });

    const result = executeNodeQuery(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });

  test('executeEdgeQuery direct lookup by ID returns edge', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-4', context, { id: asEdgeId('e1') });

    const result = executeEdgeQuery(request);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.id).toBe(asEdgeId('e1'));
  });

  test('executePropertyLookup returns entity properties', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-5', context, { entityId: asNodeId('n1') });

    const result = executePropertyLookup(request);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.properties.title).toBe('Doc 1');
    }
  });

  test('executePropertyLookup with key returns specified property or NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({ graph });
    const requestFound = createGraphAccessRequest('req-6', context, {
      entityId: asNodeId('n1'),
      propertyKey: 'title',
    });
    const requestMissing = createGraphAccessRequest('req-7', context, {
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
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-8', context, {
      startNodeIds: [asNodeId('n1')],
      maxDepth: 5,
    });

    const result = executeGraphTraversal(request);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.nodes).toHaveLength(2);
    expect(result.value.edges).toHaveLength(2);
  });

  test('executeGraphTraversal fails with VALIDATION_ERROR on empty startNodeIds', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({ graph });
    const request = createGraphAccessRequest('req-9', context, { startNodeIds: [] });

    const result = executeGraphTraversal(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('VALIDATION_ERROR');
    }
  });

  test('executeGraphTraversal fails with RESOURCE_EXHAUSTED when exceeding cost limit', () => {
    const graph = setupTestGraph();
    const context = createGraphAccessContext({
      graph,
      limits: { maxQueryCost: 1, maxQueryDepth: 10 },
    });
    const request = createGraphAccessRequest('req-10', context, {
      startNodeIds: [asNodeId('n1')],
      maxCost: 1,
    });

    const result = executeGraphTraversal(request);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe('RESOURCE_EXHAUSTED');
    }
  });
});
