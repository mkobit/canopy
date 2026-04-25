import { describe, it, expect } from 'bun:test';
import { WorkflowTriggerRegistry, WorkflowEngine } from '../src/workflow-engine';
import {
  Node,
  NodeCreated,
  Graph,
  createNodeId,
  createEventId,
  createInstant,
  asDeviceId,
  asTypeId,
  createGraphId,
  asNodeId,
  PropertyValue,
} from '@canopy/types';

describe('WorkflowTriggerRegistry', () => {
  it('should register and match a trigger for NodeCreated event', () => {
    const registry = new WorkflowTriggerRegistry();
    const typeId = asTypeId('test-type-id');

    const node: Node = {
      id: createNodeId(),
      type: asTypeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', JSON.stringify({ typeId })]]),
    };

    registry.addTrigger(node);

    const event: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: createNodeId(),
      nodeType: typeId,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: asDeviceId('test-device'),
    };

    const triggers = registry.getTriggersForEvent(event);
    expect(triggers.length).toBe(1);
    expect(triggers[0]).toBe(node);
  });
});

describe('WorkflowEngine', () => {
  const mockGraph: Graph = {
    id: createGraphId(),
    nodes: new Map(),
    edges: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('test-device'),
    },
  };

  it('should create an edge when create-edge action is executed', () => {
    const engine = new WorkflowEngine();

    // Add nodes to the graph first
    const sourceId = asNodeId('source-node');
    const targetId = asNodeId('target-node');
    const typeId = asTypeId('edge-type');

    const graphWithNodes: Graph = {
      ...mockGraph,
      nodes: new Map([
        [
          sourceId,
          {
            id: sourceId,
            type: asTypeId('node-type'),
            properties: new Map(),
            metadata: mockGraph.metadata,
          },
        ],
        [
          targetId,
          {
            id: targetId,
            type: asTypeId('node-type'),
            properties: new Map(),
            metadata: mockGraph.metadata,
          },
        ],
      ]),
    };

    const properties = new Map<string, PropertyValue>([['weight', 10]]);

    const result = engine.executeAction(graphWithNodes, 'create-edge', {
      type: typeId,
      source: sourceId,
      target: targetId,
      properties,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const newGraph = result.value.graph;
      expect(newGraph.edges.size).toBe(1);

      const newEdge = [...newGraph.edges.values()][0];
      expect(newEdge.type).toBe(typeId);
      expect(newEdge.source).toBe(sourceId);
      expect(newEdge.target).toBe(targetId);
      expect(newEdge.properties.get('weight')).toBe(10);
    }
  });

  it('should return error for unknown actions', () => {
    const engine = new WorkflowEngine();

    const result = engine.executeAction(mockGraph, 'unknown-action', {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Unknown action: unknown-action');
    }
  });

  it('should return error for create-edge action missing required params', () => {
    const engine = new WorkflowEngine();

    const result = engine.executeAction(mockGraph, 'create-edge', {
      type: asTypeId('edge-type'),
      // missing source and target
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Missing required parameters for 'create-edge' action");
    }
  });

  it('should update node property when set-property action is executed', () => {
    const engine = new WorkflowEngine();
    const nodeId = asNodeId('test-node');

    const graphWithNode: Graph = {
      ...mockGraph,
      nodes: new Map([
        [
          nodeId,
          {
            id: nodeId,
            type: asTypeId('node-type'),
            properties: new Map([['status', 'draft']]),
            metadata: mockGraph.metadata,
          },
        ],
      ]),
    };

    const result = engine.executeAction(graphWithNode, 'set-property', {
      nodeId,
      key: 'status',
      value: 'published',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const newGraph = result.value.graph;
      const updatedNode = newGraph.nodes.get(nodeId);
      expect(updatedNode).toBeDefined();
      expect(updatedNode?.properties.get('status')).toBe('published');
    }
  });

  it('should return error for set-property action missing required params', () => {
    const engine = new WorkflowEngine();
    const nodeId = asNodeId('test-node');

    const result = engine.executeAction(mockGraph, 'set-property', {
      nodeId,
      key: 'status',
      // missing value
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Missing required parameters for 'set-property' action");
    }
  });

  it('should return error when attempting to set property on non-existent node', () => {
    const engine = new WorkflowEngine();
    const nodeId = asNodeId('missing-node');

    const result = engine.executeAction(mockGraph, 'set-property', {
      nodeId,
      key: 'status',
      value: 'published',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe(`Node with ID ${nodeId} not found`);
    }
  });
});
