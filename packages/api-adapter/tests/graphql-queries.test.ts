import { describe, expect, it } from 'bun:test';
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
import { createApiAdapterContext } from '../src/api-context';
import { buildConnection, decodeCursor, encodeCursor } from '../src/graphql/connection';
import { createQueryResolvers } from '../src/graphql/resolvers/queries';

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

  let g = unwrap(createGraph(asGraphId('g1'), 'Test Graph'));
  g = unwrap(addNode(g, node1, { deviceId })).graph;
  g = unwrap(addNode(g, node2, { deviceId })).graph;
  g = unwrap(addNode(g, node3, { deviceId })).graph;
  g = unwrap(addEdge(g, edge1, { deviceId })).graph;
  return g;
};

describe('Relay Connection helpers', () => {
  it('encodes and decodes opaque cursors correctly', () => {
    const cursor = encodeCursor(15);
    expect(typeof cursor).toBe('string');
    expect(decodeCursor(cursor)).toBe(15);
  });

  it('handles invalid cursor decoding gracefully', () => {
    expect(decodeCursor('invalid-cursor-string')).toBe(0);
  });

  it('builds Relay Connection object for nodes', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const conn = buildConnection(items, 0, 10);
    expect(conn.totalCount).toBe(10);
    expect(conn.edges.length).toBe(2);
    expect(conn.edges[0]?.node?.id).toBe('a');
    expect(conn.pageInfo.hasNextPage).toBe(true);
    expect(conn.pageInfo.hasPreviousPage).toBe(false);
    expect(conn.pageInfo.startCursor).toBeDefined();
    expect(conn.pageInfo.endCursor).toBeDefined();
  });

  it('builds Relay Connection object for edges', () => {
    const items = [{ id: 'e1' }];
    const conn = buildConnection(items, 5, 10, true);
    expect(conn.totalCount).toBe(10);
    expect(conn.edges[0]?.edge?.id).toBe('e1');
    expect(conn.pageInfo.hasNextPage).toBe(true);
    expect(conn.pageInfo.hasPreviousPage).toBe(true);
  });

  it('handles empty items in buildConnection', () => {
    const conn = buildConnection([], 0, 0);
    expect(conn.totalCount).toBe(0);
    expect(conn.edges.length).toBe(0);
    expect(conn.pageInfo.startCursor).toBeUndefined();
    expect(conn.pageInfo.endCursor).toBeUndefined();
  });
});

describe('GraphQL Query Resolvers', () => {
  it('resolves node by id', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const result = resolvers.node(null, { id: 'n1' });
    expect(result).not.toBeNull();
    expect(result?.id).toBe(asNodeId('n1'));

    const missing = resolvers.node(null, { id: 'non-existent' });
    expect(missing).toBeNull();
  });

  it('resolves nodes with type filtering and pagination', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const docNodes = resolvers.nodes(null, { type: 'doc' });
    expect(docNodes.totalCount).toBe(2);
    expect(docNodes.edges.length).toBe(2);

    const paginated = resolvers.nodes(null, { type: 'doc', first: 1 });
    expect(paginated.edges.length).toBe(1);
    expect(paginated.pageInfo.hasNextPage).toBe(true);

    const page2 = resolvers.nodes(null, {
      type: 'doc',
      first: 1,
      after: paginated.pageInfo.endCursor,
    });
    expect(page2.edges.length).toBe(1);
    expect(page2.pageInfo.hasNextPage).toBe(false);
  });

  it('resolves edges with filtering and pagination', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const allEdges = resolvers.edges(null, { type: 'links' });
    expect(allEdges.totalCount).toBe(1);
    expect(allEdges.edges[0]?.edge?.id).toBe(asEdgeId('e1'));

    const filtered = resolvers.edges(null, { source: 'n1', target: 'n2', type: 'links' });
    expect(filtered.totalCount).toBe(1);

    const unmatched = resolvers.edges(null, { source: 'n2', target: 'n1', type: 'links' });
    expect(unmatched.totalCount).toBe(0);
  });

  it('resolves traversal queries and handles bounds', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const result = resolvers.traversal(null, {
      startNodeIds: ['n1'],
      maxDepth: 2,
    });
    expect(result.nodes.length).toBe(2);
    expect(result.edges.length).toBe(1);
    expect(result.truncated).toBe(false);

    const truncated = resolvers.traversal(null, {
      startNodeIds: ['n1'],
      maxNodes: 1,
    });
    expect(truncated.nodes.length).toBe(1);
    expect(truncated.truncated).toBe(true);
  });

  it('resolves gqlQuery correctly', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const res = resolvers.gqlQuery(null, { query: 'MATCH (n) RETURN n' });
    expect(res.totalCount).toBeGreaterThanOrEqual(3);
    expect(res.edges.length).toBeGreaterThanOrEqual(3);
  });

  it('resolves nodeTypes and nodeType metadata', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const types = resolvers.nodeTypes();
    expect(types.length).toBeGreaterThan(0);

    const single = resolvers.nodeType(null, { id: 'doc' });
    expect(single.id).toBe('doc');
    expect(single.name).toBe('doc');
  });

  it('resolves edgeTypes and edgeType metadata', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const types = resolvers.edgeTypes();
    expect(types.length).toBeGreaterThan(0);

    const single = resolvers.edgeType(null, { id: 'links' });
    expect(single.id).toBe('links');
    expect(single.name).toBe('links');
  });

  it('resolves systemIds summary', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const resolvers = createQueryResolvers(context);

    const summary = resolvers.systemIds();
    expect(summary.nodeTypes.length).toBeGreaterThan(0);
    expect(summary.edgeTypes.length).toBeGreaterThan(0);
    expect(summary.namespaces.length).toBe(3);
  });
});
