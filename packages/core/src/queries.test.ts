import { describe, expect, test, beforeEach } from 'bun:test';
import {
  getNodeTypes,
  getEdgeTypes,
  getNodeType,
  getEdgeType,
  getNodesOfType,
  getEdgesOfType,
  getEdgesFrom,
} from './queries';
import { bootstrap } from './bootstrap';
import { createGraphId, asTypeId, asNodeId, asDeviceId, unwrap } from '@canopy/types';
import { addNode } from './ops/node';
import { addEdge } from './ops/edge';
import { SYSTEM_IDS } from './system';
import type { Graph, Node, Edge } from '@canopy/types';
import { createInstant, createNodeId, createEdgeId } from '@canopy/types';

describe('Graph Queries', () => {
  let graph: Graph;
  const DEVICE_ID = asDeviceId('test-device-123');

  beforeEach(() => {
    // Create an empty graph
    const emptyGraph: Graph = {
      id: createGraphId(),
      name: 'Test Graph',
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID },
      nodes: new Map(),
      edges: new Map()
    };

    // Bootstrap creates a graph populated with system nodes/edges.
    const result = bootstrap(emptyGraph);
    graph = unwrap(result);

    // Add some test nodes and edges
    const customNodeTypeId = asTypeId('custom-node-type');
    const customEdgeTypeId = asTypeId('custom-edge-type');

    // Create a node of the new type
    const node1: Node = {
      id: asNodeId('node-1'),
      type: customNodeTypeId,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID }
    };
    graph = unwrap(addNode(graph, node1, { deviceId: DEVICE_ID })).graph;

    const node2: Node = {
      id: asNodeId('node-2'),
      type: customNodeTypeId,
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID }
    };
    graph = unwrap(addNode(graph, node2, { deviceId: DEVICE_ID })).graph;

    const node3: Node = {
      id: asNodeId('node-3'),
      type: asTypeId('another-type'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID }
    };
    graph = unwrap(addNode(graph, node3, { deviceId: DEVICE_ID })).graph;

    // Create some edges
    const edge1: Edge = {
      id: createEdgeId(),
      type: customEdgeTypeId,
      source: asNodeId('node-1'),
      target: asNodeId('node-2'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID }
    };
    graph = unwrap(addEdge(graph, edge1, { deviceId: DEVICE_ID })).graph;

    const edge2: Edge = {
      id: createEdgeId(),
      type: customEdgeTypeId,
      source: asNodeId('node-1'),
      target: asNodeId('node-3'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID }
    };
    graph = unwrap(addEdge(graph, edge2, { deviceId: DEVICE_ID })).graph;

    const edge3: Edge = {
      id: createEdgeId(),
      type: asTypeId('another-edge-type'),
      source: asNodeId('node-1'),
      target: asNodeId('node-2'),
      properties: new Map(),
      metadata: { created: createInstant(), modified: createInstant(), modifiedBy: DEVICE_ID }
    };
    graph = unwrap(addEdge(graph, edge3, { deviceId: DEVICE_ID })).graph;
  });

  describe('getNodeTypes', () => {
    test('returns node types from the system', () => {
      const types = getNodeTypes(graph);
      expect(types.length).toBeGreaterThan(0);
      expect(types.every((n) => n.type === SYSTEM_IDS.NODE_TYPE)).toBe(true);
    });
  });

  describe('getEdgeTypes', () => {
    test('returns edge types from the system', () => {
      const types = getEdgeTypes(graph);
      expect(types.length).toBeGreaterThan(0);
      expect(types.every((n) => n.type === SYSTEM_IDS.EDGE_TYPE)).toBe(true);
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
      const nodes = getNodesOfType(graph, asTypeId('custom-node-type'));
      expect(nodes.length).toBe(2);
      expect(nodes.every((n) => n.type === 'custom-node-type')).toBe(true);
      expect(nodes.map((n) => n.id)).toContain(asNodeId('node-1'));
      expect(nodes.map((n) => n.id)).toContain(asNodeId('node-2'));
    });

    test('returns empty array if no nodes of type exist', () => {
      const nodes = getNodesOfType(graph, asTypeId('non-existent-type'));
      expect(nodes.length).toBe(0);
    });
  });

  describe('getEdgesOfType', () => {
    test('returns all edges of a specific type', () => {
      const edges = getEdgesOfType(graph, asTypeId('custom-edge-type'));
      expect(edges.length).toBe(2);
      expect(edges.every(e => e.type === 'custom-edge-type')).toBe(true);
    });

    test('returns empty array if no edges of type exist', () => {
      const edges = getEdgesOfType(graph, asTypeId('non-existent-edge-type'));
      expect(edges.length).toBe(0);
    });
  });

  describe('getEdgesFrom', () => {
    test('returns all edges originating from a node', () => {
      const edges = getEdgesFrom(graph, asNodeId('node-1'));
      expect(edges.length).toBe(3);
      expect(edges.every(e => e.source === 'node-1')).toBe(true);
    });

    test('returns edges filtered by type if provided', () => {
      const edges = getEdgesFrom(graph, asNodeId('node-1'), asTypeId('custom-edge-type'));
      expect(edges.length).toBe(2);
      expect(edges.every(e => e.source === 'node-1' && e.type === 'custom-edge-type')).toBe(true);
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
});
