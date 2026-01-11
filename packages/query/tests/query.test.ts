import { describe, it, expect, beforeEach } from 'vitest';
import {
  Graph,
  Node,
  Edge,
  PropertyValue,
  createGraphId,
  asTypeId,
  asInstant,
  asNodeId,
  asEdgeId,
  TextValue,
  NodeId,
  EdgeId,
  unwrap,
} from '@canopy/types';
import { query } from '../src/builder';
import { executeQuery } from '../src/engine';
import { map, sort } from 'remeda';

// Helper to create a simple mock graph
function createMockGraph(): Graph {
  const nodes = new Map<NodeId, Node>();
  const edges = new Map<EdgeId, Edge>();

  const createNode = (id: string, type: string, props: Record<string, unknown> = {}) => {
    // Functional property creation
    const properties = new Map<string, PropertyValue>(
      Object.entries(props).map(([k, v]) => {
        if (typeof v === 'string') return [k, { kind: 'text', value: v }];
        if (typeof v === 'number') return [k, { kind: 'number', value: v }];
        if (typeof v === 'boolean') return [k, { kind: 'boolean', value: v }];
        return [k, { kind: 'text', value: String(v) }]; // Fallback
      }),
    );

    const nodeId = asNodeId(id);
    nodes.set(nodeId, {
      id: nodeId,
      type: asTypeId(type),
      properties,
    });
  };

  const createEdge = (
    id: string,
    type: string,
    source: string,
    target: string,
    props: Record<string, unknown> = {},
  ) => {
    const properties = new Map<string, PropertyValue>(
      Object.entries(props).map(([k, v]) => {
        if (typeof v === 'string') return [k, { kind: 'text', value: v }];
        if (typeof v === 'number') return [k, { kind: 'number', value: v }];
        return [k, { kind: 'text', value: String(v) }];
      }),
    );

    const edgeId = asEdgeId(id);
    edges.set(edgeId, {
      id: edgeId,
      type: asTypeId(type),
      source: asNodeId(source),
      target: asNodeId(target),
      properties,
    });
  };

  createNode('1', 'Person', { name: 'Alice', age: 30 });
  createNode('2', 'Person', { name: 'Bob', age: 25 });
  createNode('3', 'Person', { name: 'Charlie', age: 35 });
  createNode('4', 'Organization', { name: 'Acme Corp' });

  createEdge('e1', 'knows', '1', '2', { since: 2020 }); // Alice knows Bob
  createEdge('e2', 'knows', '2', '1', { since: 2021 }); // Bob knows Alice
  createEdge('e3', 'works_at', '1', '4'); // Alice works at Acme
  createEdge('e4', 'works_at', '2', '4'); // Bob works at Acme

  return {
    id: createGraphId('test-graph'),
    name: 'Test Graph',
    metadata: {
      created: asInstant('2023-01-01T00:00:00Z'),
      modified: asInstant('2023-01-01T00:00:00Z'),
    },
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
    const q = query().nodes('Person').build();
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
    const names = sort(
      map(result.nodes, (n) => (n.properties.get('name') as TextValue).value),
      (a, b) => a.localeCompare(b),
    );
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('queries nodes where a property equals a value', () => {
    const q = query().nodes('Person').where('name', 'eq', 'Alice').build();
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Alice');
  });

  it('queries nodes with comparison operators', () => {
    const q = query().nodes('Person').where('age', 'gt', 28).build();
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(2); // Alice (30) and Charlie (35)
    const names = sort(
      map(result.nodes, (n) => (n.properties.get('name') as TextValue).value),
      (a, b) => a.localeCompare(b),
    );
    expect(names).toEqual(['Alice', 'Charlie']);
  });

  it('queries edges by type', () => {
    const q = query().edges('knows').build();
    const result = unwrap(executeQuery(graph, q));
    expect(result.edges).toHaveLength(2);
    expect(result.nodes).toHaveLength(0);
  });

  it('queries edges from a specific node', () => {
    const q = query().edges().from('1').build(); // Alice
    const result = unwrap(executeQuery(graph, q));
    expect(result.edges).toHaveLength(2); // knows Bob, works_at Acme
    const types = sort(
      map(result.edges, (e) => e.type),
      (a, b) => a.localeCompare(b),
    );
    expect(types).toEqual(['knows', 'works_at']);
  });

  it('traverses from a node to connected nodes', () => {
    // Find people Alice knows
    // nodes(Person, name=Alice).traverse(knows, out)
    const q = query().nodes('Person').where('name', 'eq', 'Alice').traverse('knows', 'out').build();

    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Bob');
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Bob');
  });

  it('combines multiple predicates', () => {
    const q = query().nodes('Person').where('age', 'gt', 20).where('age', 'lt', 30).build();
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Bob');
  });

  it('sorts results', () => {
    const q = query().nodes('Person').orderBy('age', 'desc').build();
    const result = unwrap(executeQuery(graph, q));
    const names = map(result.nodes, (n) => (n.properties.get('name') as TextValue).value);
    expect(names).toEqual(['Charlie', 'Alice', 'Bob']);
  });

  it('limits results', () => {
    const q = query().nodes('Person').limit(2).build();
    const result = unwrap(executeQuery(graph, q));
    expect(result.nodes).toHaveLength(2);
  });
});
