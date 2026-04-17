import { describe, it, expect, beforeEach } from 'bun:test';
import { createNodeId, createEdgeId, createInstant, createDeviceId } from '@canopy/types';
import type { Graph, Node, Edge } from '@canopy/types';
import { CypherQueryEngine } from '../src/cypher';

describe('CypherQueryEngine', () => {
  let graph: Graph;
  const engine = new CypherQueryEngine();
  const deviceId = createDeviceId();

  beforeEach(() => {
    const nodeA: Node = {
      id: createNodeId(),
      type: 'Person',
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: deviceId,
      properties: new Map([
        ['name', 'Alice'],
        ['age', 30],
      ]),
      metadata: {},
    };

    const nodeB: Node = {
      id: createNodeId(),
      type: 'Person',
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: deviceId,
      properties: new Map([
        ['name', 'Bob'],
        ['age', 25],
      ]),
      metadata: {},
    };

    const nodeC: Node = {
      id: createNodeId(),
      type: 'Location',
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: deviceId,
      properties: new Map([['name', 'Wonderland']]),
      metadata: {},
    };

    const edgeAB: Edge = {
      id: createEdgeId(),
      type: 'KNOWS',
      source: nodeA.id,
      target: nodeB.id,
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: deviceId,
      properties: new Map(),
      metadata: {},
    };

    graph = {
      id: 'graph-1',
      nodes: new Map([
        [nodeA.id, nodeA],
        [nodeB.id, nodeB],
        [nodeC.id, nodeC],
      ]),
      edges: new Map([[edgeAB.id, edgeAB]]),
    };
  });

  it('should parse and execute MATCH (n) RETURN n', () => {
    const result = engine.execute(graph, 'MATCH (n) RETURN n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(3);
    }
  });

  it('should parse and execute MATCH (n:Person) RETURN n', () => {
    const result = engine.execute(graph, 'MATCH (n:Person) RETURN n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(2);
      expect(result.value.nodes[0]?.properties.get('name')).toBe('Alice');
      expect(result.value.nodes[1]?.properties.get('name')).toBe('Bob');
    }
  });

  it('should parse and execute MATCH (n:Person {name: "Alice"}) RETURN n', () => {
    const result = engine.execute(graph, 'MATCH (n:Person {name: "Alice"}) RETURN n');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(1);
      expect(result.value.nodes[0]?.properties.get('name')).toBe('Alice');
    }
  });

  it('should parse and execute MATCH (n:Person {name: "Alice"})-[r:KNOWS]->(m) RETURN m', () => {
    const result = engine.execute(
      graph,
      'MATCH (n:Person {name: "Alice"})-[r:KNOWS]->(m) RETURN m',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes).toHaveLength(1);
      expect(result.value.nodes[0]?.properties.get('name')).toBe('Bob');
    }
  });
});
