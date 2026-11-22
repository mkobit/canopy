import { describe, expect, test, beforeEach } from 'bun:test';
import {
  getNodeTypes,
  getEdgeTypes,
  getNodeType,
  getEdgeType,
  getNodesOfType,
  getEdgesOfType,
  getEdgesFrom,
  findInverseEdgeType,
} from './queries';
import { bootstrap } from './bootstrap';
import { createGraphId, asShapeId, asNodeId, asDeviceId, unwrap } from '@canopy/graph';
import { addNode } from './ops/node';
import { addEdge } from './ops/edge';
import { SYSTEM_IDS } from './system';
import type { Graph, Node, Edge } from '@canopy/graph';
import { createInstant, createEdgeId, zeroRevision } from '@canopy/graph';

describe('Graph Queries', () => {
  let graph: Graph;
  const DEVICE_ID = asDeviceId('test-device-123');

  beforeEach(() => {
    // Create an empty graph
    const emptyGraph: Graph = {
      id: createGraphId(),
      name: 'Test Graph',
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
      revision: zeroRevision(),
      nodes: new Map(),
      edges: new Map(),
    };

    // Bootstrap creates a graph populated with system nodes/edges.
    const result = bootstrap(emptyGraph);
    graph = unwrap(result);

    // Add some test nodes and edges
    const customNodeTypeId = asShapeId('custom-node-type');
    const customEdgeTypeId = asShapeId('custom-edge-type');

    // Create a node of the new type
    const node1: Node = {
      id: asNodeId('node-1'),
      shape: customNodeTypeId,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    graph = unwrap(addNode(graph, node1, { deviceId: DEVICE_ID })).graph;

    const node2: Node = {
      id: asNodeId('node-2'),
      shape: customNodeTypeId,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    graph = unwrap(addNode(graph, node2, { deviceId: DEVICE_ID })).graph;

    const node3: Node = {
      id: asNodeId('node-3'),
      shape: asShapeId('another-type'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    graph = unwrap(addNode(graph, node3, { deviceId: DEVICE_ID })).graph;

    // Create some edges
    const edge1: Edge = {
      id: createEdgeId(),
      shape: customEdgeTypeId,
      source: asNodeId('node-1'),
      target: asNodeId('node-2'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    graph = unwrap(addEdge(graph, edge1, { deviceId: DEVICE_ID })).graph;

    const edge2: Edge = {
      id: createEdgeId(),
      shape: customEdgeTypeId,
      source: asNodeId('node-1'),
      target: asNodeId('node-3'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    graph = unwrap(addEdge(graph, edge2, { deviceId: DEVICE_ID })).graph;

    const edge3: Edge = {
      id: createEdgeId(),
      shape: asShapeId('another-edge-type'),
      source: asNodeId('node-1'),
      target: asNodeId('node-2'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
    };
    graph = unwrap(addEdge(graph, edge3, { deviceId: DEVICE_ID })).graph;
  });

  describe('getNodeTypes', () => {
    test('returns node types from the system', () => {
      const types = getNodeTypes(graph);
      expect(types.length).toBeGreaterThan(0);
      expect(types.every((n) => n.shape === SYSTEM_IDS.NODE_TYPE)).toBe(true);
    });
  });

  describe('getEdgeTypes', () => {
    test('returns edge types from the system', () => {
      const types = getEdgeTypes(graph);
      expect(types.length).toBeGreaterThan(0);
      expect(types.every((n) => n.shape === SYSTEM_IDS.EDGE_TYPE)).toBe(true);
    });
  });

  describe('getNodeType', () => {
    test('finds node type by ID', () => {
      const type = getNodeType(graph, SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK);
      expect(type).toBeDefined();
      expect(type?.id).toBe(SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK);
    });

    test('finds node type by name', () => {
      const type = getNodeType(graph, 'TextBlock');
      expect(type).toBeDefined();
      expect(type?.properties.get('name')).toBe('TextBlock');
    });

    test('returns undefined for unknown node type', () => {
      const type = getNodeType(graph, 'UnknownType');
      expect(type).toBeUndefined();
    });
  });

  describe('getEdgeType', () => {
    test('finds edge type by ID', () => {
      const type = getEdgeType(graph, SYSTEM_IDS.EDGE_CHILD_OF);
      expect(type).toBeDefined();
      expect(type?.id).toBe(SYSTEM_IDS.EDGE_CHILD_OF);
    });

    test('finds edge type by name', () => {
      const type = getEdgeType(graph, 'Child Of');
      expect(type).toBeDefined();
      expect(type?.properties.get('name')).toBe('Child Of');
    });

    test('returns undefined for unknown edge type', () => {
      const type = getEdgeType(graph, 'UnknownEdgeType');
      expect(type).toBeUndefined();
    });
  });

  describe('getNodesOfType', () => {
    test('returns all nodes of a specific type', () => {
      const nodes = getNodesOfType(graph, asShapeId('custom-node-type'));
      expect(nodes.length).toBe(2);
      expect(nodes.every((n) => n.shape === 'custom-node-type')).toBe(true);
      expect(nodes.map((n) => n.id)).toContain(asNodeId('node-1'));
      expect(nodes.map((n) => n.id)).toContain(asNodeId('node-2'));
    });

    test('returns empty array if no nodes of type exist', () => {
      const nodes = getNodesOfType(graph, asShapeId('non-existent-type'));
      expect(nodes.length).toBe(0);
    });
  });

  describe('getEdgesOfType', () => {
    test('returns all edges of a specific type', () => {
      const edges = getEdgesOfType(graph, asShapeId('custom-edge-type'));
      expect(edges.length).toBe(2);
      expect(edges.every((edge) => edge.shape === 'custom-edge-type')).toBe(true);
    });

    test('returns empty array if no edges of type exist', () => {
      const edges = getEdgesOfType(graph, asShapeId('non-existent-edge-type'));
      expect(edges.length).toBe(0);
    });
  });

  describe('getEdgesFrom', () => {
    test('returns all edges originating from a node', () => {
      const edges = getEdgesFrom(graph, asNodeId('node-1'));
      expect(edges.length).toBe(3);
      expect(edges.every((edge) => edge.source === 'node-1')).toBe(true);
    });

    test('returns edges filtered by type if provided', () => {
      const edges = getEdgesFrom(graph, asNodeId('node-1'), asShapeId('custom-edge-type'));
      expect(edges.length).toBe(2);
      expect(
        edges.every((edge) => edge.source === 'node-1' && edge.shape === 'custom-edge-type'),
      ).toBe(true);
    });

    test('returns empty array for node with no outgoing edges', () => {
      const edges = getEdgesFrom(graph, asNodeId('node-2'));
      expect(edges.length).toBe(0);
    });

    test('returns empty array for non-existent node', () => {
      const edges = getEdgesFrom(graph, asNodeId('non-existent-node'));
      expect(edges.length).toBe(0);
    });
  });
  describe('findInverseEdgeType', () => {
    test('returns ok(undefined) if edge type has no inverse', () => {
      // EDGE_PREREQUISITE doesn't have an inverse defined
      const result = findInverseEdgeType(graph, asShapeId(SYSTEM_IDS.EDGE_PREREQUISITE));
      expect(result.ok).toBeTrue();
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    test('returns ok(Node) if edge type has a valid inverse', () => {
      // Bootstrap doesn't set inverse for built-in edge types right now.
      // Let's create two custom edge types and make them inverses of each other.
      const parentOfId = asNodeId('custom:edgetype:parent-of');
      const childOfId = asNodeId('custom:edgetype:child-of');

      const parentOfNode: Node = {
        id: parentOfId,
        shape: SYSTEM_IDS.EDGE_TYPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map([['inverse', 'custom:edgetype:child-of']]),
      };

      const childOfNode: Node = {
        id: childOfId,
        shape: SYSTEM_IDS.EDGE_TYPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map([['inverse', 'custom:edgetype:parent-of']]),
      };

      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(parentOfId, parentOfNode);
      mutableNodes.set(childOfId, childOfNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeType(testGraph, asShapeId('custom:edgetype:parent-of'));
      expect(result.ok).toBeTrue();
      if (!result.ok) {
        return;
      }

      expect(result.value).toBeDefined();
      expect(result.value?.id).toBe(childOfId);
    });

    test('returns err if inverse property is not a string', () => {
      const brokenId = asNodeId('custom:edgetype:broken');
      const brokenNode: Node = {
        id: brokenId,
        shape: SYSTEM_IDS.EDGE_TYPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map([['inverse', 123]]), // Invalid inverse
      };
      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(brokenId, brokenNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeType(testGraph, asShapeId('custom:edgetype:broken'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('must be a string');
      }
    });

    test('returns err if edge type node is missing', () => {
      const result = findInverseEdgeType(graph, asShapeId('missing:edgetype:foo'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('Edge type node not found');
      }
    });

    test('returns err if edge type is not an EDGE_TYPE node', () => {
      // Use a node type node instead of an edge type
      const result = findInverseEdgeType(graph, asShapeId(SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('is not an edge type');
      }
    });

    test('returns err if inverse reference is broken', () => {
      const brokenId = asNodeId('custom:edgetype:broken2');
      const brokenNode: Node = {
        id: brokenId,
        shape: SYSTEM_IDS.EDGE_TYPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map([['inverse', 'missing:edgetype:bar']]), // Broken ref
      };
      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(brokenId, brokenNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeType(testGraph, asShapeId('custom:edgetype:broken2'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('Broken reference');
      }
    });

    test('returns err if inverse reference is not an edge type', () => {
      const brokenId = asNodeId('custom:edgetype:broken3');
      const brokenNode: Node = {
        id: brokenId,
        shape: SYSTEM_IDS.EDGE_TYPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map([['inverse', SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK]]), // Refers to a node type
      };
      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(brokenId, brokenNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeType(testGraph, asShapeId('custom:edgetype:broken3'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('is not an edge type');
      }
    });
  });
});
