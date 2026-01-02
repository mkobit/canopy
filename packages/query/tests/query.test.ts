import { describe, it, expect, beforeEach } from 'vitest';
import {
  Graph, Node, Edge, PropertyValue,
  createGraphId, asTypeId, asInstant, asNodeId, asEdgeId, TextValue
} from '@canopy/types';
import { query } from '../src/builder.js';
import { executeQuery } from '../src/engine.js';

// Helper to create a simple mock graph
function createMockGraph(): Graph {
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge>();

  const createNode = (id: string, type: string, props: Record<string, unknown> = {}) => {
    const properties = new Map<string, PropertyValue>();
    for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string') properties.set(k, { kind: 'text', value: v });
      if (typeof v === 'number') properties.set(k, { kind: 'number', value: v });
      if (typeof v === 'boolean') properties.set(k, { kind: 'boolean', value: v });
    }
    nodes.set(id, {
      id: asNodeId(id),
      type: asTypeId(type),
      properties,
    });
  };

  const createEdge = (id: string, type: string, source: string, target: string, props: Record<string, unknown> = {}) => {
     const properties = new Map<string, PropertyValue>();
     for (const [k, v] of Object.entries(props)) {
      if (typeof v === 'string') properties.set(k, { kind: 'text', value: v });
      if (typeof v === 'number') properties.set(k, { kind: 'number', value: v });
    }
    edges.set(id, {
      id: asEdgeId(id),
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
        modified: asInstant('2023-01-01T00:00:00Z')
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
    const result = executeQuery(graph, q);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
    const names = result.nodes.map(n => (n.properties.get('name') as TextValue).value).sort();
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('queries nodes where a property equals a value', () => {
    const q = query().nodes('Person').where('name', 'eq', 'Alice').build();
    const result = executeQuery(graph, q);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Alice');
  });

  it('queries nodes with comparison operators', () => {
    const q = query().nodes('Person').where('age', 'gt', 28).build();
    const result = executeQuery(graph, q);
    expect(result.nodes).toHaveLength(2); // Alice (30) and Charlie (35)
    const names = result.nodes.map(n => (n.properties.get('name') as TextValue).value).sort();
    expect(names).toEqual(['Alice', 'Charlie']);
  });

  it('queries edges by type', () => {
    const q = query().edges('knows').build();
    const result = executeQuery(graph, q);
    expect(result.edges).toHaveLength(2);
    expect(result.nodes).toHaveLength(0);
  });

  it('queries edges from a specific node', () => {
    const q = query().edges().from('1').build(); // Alice
    const result = executeQuery(graph, q);
    expect(result.edges).toHaveLength(2); // knows Bob, works_at Acme
    const types = result.edges.map(e => e.type).sort();
    expect(types).toEqual(['knows', 'works_at']);
  });

  it('traverses from a node to connected nodes', () => {
    // Find people Alice knows
    // nodes(Person, name=Alice).traverse(knows, out)
    const q = query()
      .nodes('Person')
      .where('name', 'eq', 'Alice')
      .traverse('knows', 'out')
      .build();

    const result = executeQuery(graph, q);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Bob');
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Bob');
  });

  it('combines multiple predicates', () => {
    const q = query()
        .nodes('Person')
        .where('age', 'gt', 20)
        .where('age', 'lt', 30)
        .build();
    const result = executeQuery(graph, q);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0].properties.get('name') as TextValue).value).toBe('Bob');
  });

  it('sorts results', () => {
    const q = query().nodes('Person').orderBy('age', 'desc').build();
    const result = executeQuery(graph, q);
    const names = result.nodes.map(n => (n.properties.get('name') as TextValue).value);
    expect(names).toEqual(['Charlie', 'Alice', 'Bob']);
  });

  it('limits results', () => {
    const q = query().nodes('Person').limit(2).build();
    const result = executeQuery(graph, q);
    expect(result.nodes).toHaveLength(2);
  });
});
