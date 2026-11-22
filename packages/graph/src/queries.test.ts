import { describe, expect, test, beforeEach } from 'bun:test';
import {
  getShapes,
  getShape,
  findShapeByName,
  resolveShape,
  getNodesOfShape,
  getEdgesOfShape,
  getEdgesFrom,
  findInverseEdgeShape,
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

  describe('getShapes', () => {
    test('returns node shapes from the system', () => {
      const shapes = getShapes(graph, 'node');
      expect(shapes.length).toBeGreaterThan(0);
      expect(
        shapes.every(
          (n) => n.shape === SYSTEM_IDS.SHAPE && n.properties.get('entityKind') === 'node',
        ),
      ).toBe(true);
    });

    test('returns edge shapes from the system', () => {
      const shapes = getShapes(graph, 'edge');
      expect(shapes.length).toBeGreaterThan(0);
      expect(
        shapes.every(
          (n) => n.shape === SYSTEM_IDS.SHAPE && n.properties.get('entityKind') === 'edge',
        ),
      ).toBe(true);
    });
  });

  describe('getShape and findShapeByName', () => {
    test('finds node shape by ID', () => {
      const shape = getShape(graph, asShapeId(SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK));
      expect(shape).toBeDefined();
      expect(shape?.id).toBe(SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK);
    });

    test('finds node shape by name', () => {
      const shape = findShapeByName(graph, 'TextBlock', 'node');
      expect(shape).toBeDefined();
      expect(shape?.properties.get('name')).toBe('TextBlock');
    });

    test('returns undefined for unknown node shape', () => {
      expect(getShape(graph, asShapeId('UnknownType'))).toBeUndefined();
      expect(findShapeByName(graph, 'UnknownType', 'node')).toBeUndefined();
    });

    test('finds edge shape by ID and name', () => {
      const shape = getShape(graph, asShapeId(SYSTEM_IDS.EDGE_CHILD_OF));
      expect(shape).toBeDefined();
      expect(shape?.id).toBe(SYSTEM_IDS.EDGE_CHILD_OF);
      expect(findShapeByName(graph, 'Child Of', 'edge')?.id).toBe(SYSTEM_IDS.EDGE_CHILD_OF);
    });

    test('resolves ShapeDefinition via resolveShape', () => {
      const resolved = resolveShape(graph, SYSTEM_IDS.PROXY);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) {
        return;
      }

      expect(resolved.value.entityKind).toBe('node');
      expect(resolved.value.closed).toBe(false);
      expect(
        resolved.value.properties.some((b) => b.kind === 'reference' && b.name === 'uri'),
      ).toBe(true);
    });
  });

  describe('getNodesOfShape', () => {
    test('returns all nodes of a specific shape', () => {
      const nodes = getNodesOfShape(graph, asShapeId('custom-node-type'));
      expect(nodes.length).toBe(2);
      expect(nodes.every((n) => n.shape === 'custom-node-type')).toBe(true);
      expect(nodes.map((n) => n.id)).toContain(asNodeId('node-1'));
      expect(nodes.map((n) => n.id)).toContain(asNodeId('node-2'));
    });

    test('returns empty array if no nodes of shape exist', () => {
      const nodes = getNodesOfShape(graph, asShapeId('non-existent-type'));
      expect(nodes.length).toBe(0);
    });
  });

  describe('getEdgesOfShape', () => {
    test('returns all edges of a specific shape', () => {
      const edges = getEdgesOfShape(graph, asShapeId('custom-edge-type'));
      expect(edges.length).toBe(2);
      expect(edges.every((edge) => edge.shape === 'custom-edge-type')).toBe(true);
    });

    test('returns empty array if no edges of shape exist', () => {
      const edges = getEdgesOfShape(graph, asShapeId('non-existent-edge-type'));
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
  describe('findInverseEdgeShape', () => {
    test('returns ok(undefined) if edge shape has no inverse', () => {
      // EDGE_PREREQUISITE doesn't have an inverse defined
      const result = findInverseEdgeShape(graph, asShapeId(SYSTEM_IDS.EDGE_PREREQUISITE));
      expect(result.ok).toBeTrue();
      if (result.ok) {
        expect(result.value).toBeUndefined();
      }
    });

    test('returns ok(Node) if edge shape has a valid inverse', () => {
      const parentOfId = asNodeId('custom:edgetype:parent-of');
      const childOfId = asNodeId('custom:edgetype:child-of');

      const parentOfNode: Node = {
        id: parentOfId,
        shape: SYSTEM_IDS.SHAPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map<string, string>([
          ['entityKind', 'edge'],
          ['inverse', 'custom:edgetype:child-of'],
        ]),
      };

      const childOfNode: Node = {
        id: childOfId,
        shape: SYSTEM_IDS.SHAPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map<string, string>([
          ['entityKind', 'edge'],
          ['inverse', 'custom:edgetype:parent-of'],
        ]),
      };

      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(parentOfId, parentOfNode);
      mutableNodes.set(childOfId, childOfNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeShape(testGraph, asShapeId('custom:edgetype:parent-of'));
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
        shape: SYSTEM_IDS.SHAPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map<string, string | number>([
          ['entityKind', 'edge'],
          ['inverse', 123],
        ]),
      };
      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(brokenId, brokenNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeShape(testGraph, asShapeId('custom:edgetype:broken'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('must be a string');
      }
    });

    test('returns err if edge shape node is missing', () => {
      const result = findInverseEdgeShape(graph, asShapeId('missing:edgetype:foo'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('Edge shape node not found');
      }
    });

    test('returns err if edge shape is not an edge Shape node', () => {
      const result = findInverseEdgeShape(graph, asShapeId(SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('is not an edge shape');
      }
    });

    test('returns err if inverse reference is broken', () => {
      const brokenId = asNodeId('custom:edgetype:broken2');
      const brokenNode: Node = {
        id: brokenId,
        shape: SYSTEM_IDS.SHAPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map<string, string>([
          ['entityKind', 'edge'],
          ['inverse', 'missing:edgetype:bar'],
        ]),
      };
      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(brokenId, brokenNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeShape(testGraph, asShapeId('custom:edgetype:broken2'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('Broken reference');
      }
    });

    test('returns err if inverse reference is not an edge shape', () => {
      const brokenId = asNodeId('custom:edgetype:broken3');
      const brokenNode: Node = {
        id: brokenId,
        shape: SYSTEM_IDS.SHAPE,
        metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
        properties: new Map<string, string>([
          ['entityKind', 'edge'],
          ['inverse', SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK],
        ]),
      };
      const mutableNodes = new Map(graph.nodes);
      mutableNodes.set(brokenId, brokenNode);
      const testGraph = { ...graph, nodes: mutableNodes };

      const result = findInverseEdgeShape(testGraph, asShapeId('custom:edgetype:broken3'));
      expect(result.ok).toBeFalse();
      if (!result.ok) {
        expect(result.error.message).toContain('is not an edge shape');
      }
    });
  });
});
