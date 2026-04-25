import { describe, it, expect, beforeEach } from 'bun:test';
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
  NodeId,
  EdgeId,
  unwrap,
  ScalarValue,
} from '@canopy/types';
import { CypherQueryEngine } from '../src/cypher';
import { map, sort } from 'remeda';

// Helper to create a simple mock graph
function createMockGraph(): Graph {
  const nodes = new Map<NodeId, Node>();
  const edges = new Map<EdgeId, Edge>();

  const createNode = (id: string, type: string, properties_: Record<string, ScalarValue> = {}) => {
    // Functional property creation
    const properties = new Map<string, PropertyValue>(Object.entries(properties_));

    const nodeId = asNodeId(id);
    nodes.set(nodeId, {
      id: nodeId,
      type: asTypeId(type),
      properties,
      metadata: {
        created: asInstant('2023-01-01T00:00:00Z'),
        modified: asInstant('2023-01-01T00:00:00Z'),
      },
    });
  };

  const createEdge = (
    id: string,
    type: string,
    source: string,
    target: string,
    properties_: Record<string, ScalarValue> = {},
  ) => {
    const properties = new Map<string, PropertyValue>(Object.entries(properties_));

    const edgeId = asEdgeId(id);
    edges.set(edgeId, {
      id: edgeId,
      type: asTypeId(type),
      source: asNodeId(source),
      target: asNodeId(target),
      properties,
      metadata: {
        created: asInstant('2023-01-01T00:00:00Z'),
        modified: asInstant('2023-01-01T00:00:00Z'),
      },
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

describe('CypherQueryEngine', () => {
  let graph: Graph;
  let engine: CypherQueryEngine;

  beforeEach(() => {
    graph = createMockGraph();
    engine = new CypherQueryEngine();
  });

  it('queries all nodes when no type is specified', () => {
    const result = unwrap(engine.execute(graph, 'MATCH (n)'));
    expect(result.nodes).toHaveLength(4);
    expect(result.edges).toHaveLength(0);
  });

  it('queries nodes of a given type', () => {
    const result = unwrap(engine.execute(graph, 'MATCH (n:Person)'));
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
    const names = sort(
      map(result.nodes, (n) => n.properties.get('name') as string),
      (a, b) => a.localeCompare(b),
    );
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('queries nodes of a given type with spaces', () => {
    const result = unwrap(engine.execute(graph, 'MATCH ( n : Person ) RETURN n'));
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(0);
  });

  it('queries nodes of another type', () => {
    const result = unwrap(engine.execute(graph, 'MATCH (o:Organization)'));
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].properties.get('name')).toBe('Acme Corp');
  });

  it('returns an error for unsupported Cypher syntax', () => {
    const result = engine.execute(graph, 'MATCH (n)-[r]->(m) RETURN n, r, m');
    expect('error' in result).toBeTrue();
    if ('error' in result) {
      expect(result.error.message).toContain('Cypher query execution is not yet implemented');
    }
  });
});
