import { describe, it, expect, beforeEach } from 'bun:test';
import {
  Graph,
  Node,
  Edge,
  PropertyValue,
  createGraphId,
  asShapeId,
  asInstant,
  asNodeId,
  asEdgeId,
  NodeId,
  EdgeId,
  unwrap,
  ScalarValue,
  asDeviceId,
  zeroRevision,
} from '@canopy/graph';
import { pipe } from 'remeda';
import {
  query,
  nodes,
  edges,
  where,
  orderBy,
  limit,
  traverse,
  from,
  returns,
} from '../src/pipeline';
import { executeQuery } from '../src/engine';
import { map, sort } from 'remeda';

// Helper to create a simple mock graph
function createMockGraph(): Graph {
  const nodes = new Map<NodeId, Node>();
  const edges = new Map<EdgeId, Edge>();

  const createNode = (
    id: string,
    shape: string | undefined,
    properties_: Record<string, ScalarValue> = {},
  ) => {
    // Functional property creation
    const properties = new Map<string, PropertyValue>(Object.entries(properties_));

    const nodeId = asNodeId(id);
    nodes.set(nodeId, {
      id: nodeId,
      ...(shape !== undefined && { shape: asShapeId(shape) }),
      properties,
      metadata: {
        created: asInstant('2023-01-01T00:00:00Z'),
        modified: asInstant('2023-01-01T00:00:00Z'),
        modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
      },
    });
  };

  const createEdge = (
    id: string,
    shape: string | undefined,
    source: string,
    target: string,
    properties_: Record<string, ScalarValue> = {},
  ) => {
    const properties = new Map<string, PropertyValue>(Object.entries(properties_));

    const edgeId = asEdgeId(id);
    edges.set(edgeId, {
      id: edgeId,
      ...(shape !== undefined && { shape: asShapeId(shape) }),
      source: asNodeId(source),
      target: asNodeId(target),
      properties,
      metadata: {
        created: asInstant('2023-01-01T00:00:00Z'),
        modified: asInstant('2023-01-01T00:00:00Z'),
        modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
      },
    });
  };

  createNode('1', 'Person', { name: 'Alice', age: 30 });
  createNode('2', 'Person', { name: 'Bob', age: 25 });
  createNode('3', 'Person', { name: 'Charlie', age: 35 });
  createNode('4', 'Organization', { name: 'Acme Corp' });
  createNode('5', undefined, { name: 'Scratch Note', tag: 'open' });

  createEdge('e1', 'knows', '1', '2', { since: 2020 }); // Alice knows Bob
  createEdge('e2', 'knows', '2', '1', { since: 2021 }); // Bob knows Alice
  createEdge('e3', 'works_at', '1', '4'); // Alice works at Acme
  createEdge('e4', 'works_at', '2', '4'); // Bob works at Acme
  createEdge('e5', undefined, '1', '5'); // Alice open link to Scratch Note

  return {
    id: createGraphId(),
    name: 'Test Graph',
    metadata: {
      created: asInstant('2023-01-01T00:00:00Z'),
      modified: asInstant('2023-01-01T00:00:00Z'),
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
    revision: zeroRevision(),
    nodes: nodes,
    edges: edges,
  };
}

describe('Query Engine', () => {
  let graph: Graph;

  beforeEach(() => {
    graph = createMockGraph();
  });

  it('queries all nodes of a given type', () => {
    const q = pipe(query(), nodes('Person'));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
    const names = sort(
      map(result.nodes, (n) => n.properties.get('name') as string),
      (a, b) => a.localeCompare(b),
    );
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('queries nodes where a property equals a value', () => {
    const q = pipe(query(), nodes('Person'), where('name', 'eq', 'Alice'));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    const [firstNode] = result.nodes;
    if (firstNode === undefined) throw new Error('Expected node');
    expect(firstNode.properties.get('name')).toBe('Alice');
  });

  it('queries nodes with starts-with operator', () => {
    const q = pipe(query(), nodes('Person'), where('name', 'starts-with', 'Al'));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    const [firstNode] = result.nodes;
    if (firstNode === undefined) throw new Error('Expected node');
    expect(firstNode.properties.get('name')).toBe('Alice');
  });

  it('queries nodes with ends-with operator', () => {
    const q = pipe(query(), nodes('Person'), where('name', 'ends-with', 'ice'));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    const [firstNode] = result.nodes;
    if (firstNode === undefined) throw new Error('Expected node');
    expect(firstNode.properties.get('name')).toBe('Alice');
  });

  it('returns false when applying text operators to non-string properties', () => {
    const q = pipe(query(), nodes('Person'), where('age', 'starts-with', '3'));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(0);
  });

  it('queries nodes with comparison operators', () => {
    const q = pipe(query(), nodes('Person'), where('age', 'gt', 28));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(2); // Alice (30) and Charlie (35)
    const names = sort(
      map(result.nodes, (n) => n.properties.get('name') as string),
      (a, b) => a.localeCompare(b),
    );
    expect(names).toEqual(['Alice', 'Charlie']);
  });

  it('queries edges by type', () => {
    const q = pipe(query(), edges('knows'));
    const result = unwrap(executeQuery(graph, q));
    expect(result.edges).toHaveLength(2);
    expect(result.nodes).toHaveLength(0);
  });

  it('queries edges from a specific node', () => {
    const q = pipe(query(), edges(), from('1')); // Alice
    const result = unwrap(executeQuery(graph, q));
    expect(result.edges).toHaveLength(3); // knows Bob, works_at Acme, open link to 5
    const shapes = result.edges
      .map((edge) => edge.shape ?? '')
      .toSorted((a, b) => a.localeCompare(b));
    expect(shapes).toEqual(['', asShapeId('knows'), asShapeId('works_at')]);
  });

  it('traverses from a node to connected nodes', () => {
    // Find people Alice knows
    // nodes(Person, name=Alice).traverse(knows, out)
    const q = pipe(
      query(),
      nodes('Person'),
      where('name', 'eq', 'Alice'),
      traverse('knows', 'out'),
    );

    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    const [firstNode] = result.nodes;
    if (firstNode === undefined) throw new Error('Expected node');
    expect(firstNode.properties.get('name')).toBe('Bob');
  });

  it('combines multiple predicates', () => {
    const q = pipe(query(), nodes('Person'), where('age', 'gt', 20), where('age', 'lt', 30));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    const [firstNode] = result.nodes;
    if (firstNode === undefined) throw new Error('Expected node');
    expect(firstNode.properties.get('name')).toBe('Bob');
  });

  it('sorts results', () => {
    const q = pipe(query(), nodes('Person'), orderBy('age', 'desc'));
    const result = unwrap(executeQuery(graph, q));
    const names = map(result.nodes, (n) => n.properties.get('name') as string);
    expect(names).toEqual(['Charlie', 'Alice', 'Bob']);
  });

  it('limits results', () => {
    const q = pipe(query(), nodes('Person'), limit(2));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(2);
  });

  it('projects specific properties into rows', () => {
    const q = pipe(query(), nodes('Person'), orderBy('age', 'asc'), returns(['name', 'age']));
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(3); // Nodes are still returned
    expect(result.rows).toBeDefined();
    expect(result.rows).toEqual([
      { name: 'Bob', age: 25 },
      { name: 'Alice', age: 30 },
      { name: 'Charlie', age: 35 },
    ]);
  });

  it('includes open nodes in unscanned node queries and shape filter excludes them', () => {
    const allOpenMatches = unwrap(
      executeQuery(graph, pipe(query(), nodes(), where('tag', 'eq', 'open'))),
    );
    expect(allOpenMatches.nodes.map((n) => n.id)).toEqual([asNodeId('5')]);

    const shapeFiltered = unwrap(
      executeQuery(graph, pipe(query(), nodes(), where('shape', 'eq', 'Person'))),
    );
    expect(shapeFiltered.nodes).toHaveLength(3);

    const openTraversal = unwrap(
      executeQuery(
        graph,
        pipe(query(), nodes('Person'), where('name', 'eq', 'Alice'), traverse(undefined, 'out')),
      ),
    );
    expect(openTraversal.nodes.map((n) => n.id).toSorted((a, b) => a.localeCompare(b))).toEqual([
      asNodeId('2'),
      asNodeId('4'),
      asNodeId('5'),
    ]);
  });
});
