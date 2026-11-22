import { describe, it, expect } from 'bun:test';
import {
  createWorkflowTriggerRegistry,
  createWorkflowEngine,
  executeWorkflowAction,
} from '../src/workflow-engine';
import {
  Node,
  NodeCreated,
  Graph,
  createNodeId,
  createEventId,
  createInstant,
  asDeviceId,
  asShapeId,
  createGraphId,
  asNodeId,
  PropertyValue,
  zeroRevision,
} from '@canopy/graph';

describe('WorkflowTriggerRegistry', () => {
  it('should register and match a trigger for NodeCreated event', () => {
    const registry = createWorkflowTriggerRegistry();
    const typeId = asShapeId('test-type-id');

    const node: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', JSON.stringify({ typeId })]]),
    };

    const added = registry.addTrigger(node);
    expect(added).toBe(true);

    const event: NodeCreated = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: createNodeId(),
      shapeId: typeId,
      properties: new Map(),
      timestamp: createInstant(),
      deviceId: asDeviceId('test-device'),
    };

    const triggers = registry.getTriggersForEvent(event);
    expect(triggers.length).toBe(1);
    expect(triggers[0]).toBe(node);
  });

  it('should return false when condition property is missing or not a string', () => {
    const registry = createWorkflowTriggerRegistry();

    const missingConditionNode: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map(),
    };
    expect(registry.addTrigger(missingConditionNode)).toBe(false);

    const nonStringConditionNode: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', 123]]),
    };
    expect(registry.addTrigger(nonStringConditionNode)).toBe(false);
  });

  it('should return false when condition contains malformed JSON', () => {
    const registry = createWorkflowTriggerRegistry();

    const malformedNode: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', '{ invalid json }']]),
    };

    expect(registry.addTrigger(malformedNode)).toBe(false);
  });

  it('should return false when condition JSON is not an object with typeId', () => {
    const registry = createWorkflowTriggerRegistry();

    const missingTypeIdNode: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', JSON.stringify({ otherProperty: 'value' })]]),
    };
    expect(registry.addTrigger(missingTypeIdNode)).toBe(false);

    const nullJsonNode: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', JSON.stringify(null)]]),
    };
    expect(registry.addTrigger(nullJsonNode)).toBe(false);

    const primitiveJsonNode: Node = {
      id: createNodeId(),
      shape: asShapeId('trigger'),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('test-device'),
      },
      properties: new Map([['condition', JSON.stringify('plain-string')]]),
    };
    expect(registry.addTrigger(primitiveJsonNode)).toBe(false);
  });
});

describe('WorkflowEngine', () => {
  const mockGraph: Graph = {
    id: createGraphId(),
    name: 'Mock Graph',
    nodes: new Map(),
    edges: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('test-device'),
    },
    revision: zeroRevision(),
  };

  it('should create an edge when create-edge action is executed', () => {
    const engine = createWorkflowEngine();

    // Add nodes to the graph first
    const sourceId = asNodeId('source-node');
    const targetId = asNodeId('target-node');
    const typeId = asShapeId('edge-type');

    const graphWithNodes: Graph = {
      ...mockGraph,
      nodes: new Map([
        [
          sourceId,
          {
            id: sourceId,
            shape: asShapeId('node-type'),
            properties: new Map(),
            metadata: mockGraph.metadata,
          },
        ],
        [
          targetId,
          {
            id: targetId,
            shape: asShapeId('node-type'),
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
    if (!result.ok) return;
    const newGraph = result.value.graph;
    expect(newGraph.edges.size).toBe(1);

    const [newEdge] = [...newGraph.edges.values()];
    if (newEdge === undefined) {
      throw new Error('Expected new edge to be created');
    }
    expect(newEdge.shape).toBe(typeId);
    expect(newEdge.source).toBe(sourceId);
    expect(newEdge.target).toBe(targetId);
    expect(newEdge.properties.get('weight')).toBe(10);
  });

  it('should support executeWorkflowAction as a standalone function', () => {
    const sourceId = asNodeId('source-node');
    const targetId = asNodeId('target-node');
    const typeId = asShapeId('edge-type');

    const graphWithNodes: Graph = {
      ...mockGraph,
      nodes: new Map([
        [
          sourceId,
          {
            id: sourceId,
            shape: asShapeId('node-type'),
            properties: new Map(),
            metadata: mockGraph.metadata,
          },
        ],
        [
          targetId,
          {
            id: targetId,
            shape: asShapeId('node-type'),
            properties: new Map(),
            metadata: mockGraph.metadata,
          },
        ],
      ]),
    };

    const result = executeWorkflowAction(graphWithNodes, 'create-edge', {
      type: typeId,
      source: sourceId,
      target: targetId,
    });

    expect(result.ok).toBe(true);
  });

  it('should return error for unknown actions', () => {
    const engine = createWorkflowEngine();

    const result = engine.executeAction(mockGraph, 'unknown-action', {});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('Unknown action: unknown-action');
    }
  });

  it('should return error for create-edge action missing required params', () => {
    const engine = createWorkflowEngine();

    const result = engine.executeAction(mockGraph, 'create-edge', {
      shape: asShapeId('edge-type'),
      // missing source and target
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("Missing required parameters for 'create-edge' action");
    }
  });

  it('should update node property when set-property action is executed', () => {
    const engine = createWorkflowEngine();
    const nodeId = asNodeId('test-node');

    const graphWithNode: Graph = {
      ...mockGraph,
      nodes: new Map([
        [
          nodeId,
          {
            id: nodeId,
            shape: asShapeId('node-type'),
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
    if (!result.ok) return;
    const newGraph = result.value.graph;
    const updatedNode = newGraph.nodes.get(nodeId);
    expect(updatedNode).toBeDefined();
    expect(updatedNode?.properties.get('status')).toBe('published');
  });

  it('should return error for set-property action missing required params', () => {
    const engine = createWorkflowEngine();
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
    const engine = createWorkflowEngine();
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
