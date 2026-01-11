import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import { addNode } from '../src/ops';
import { validateNode, validateEdge } from '../src/validation';
import { SYSTEM_IDS } from '../src/system';
import {
  asNodeId,
  asTypeId,
  createNodeId,
  createGraphId,
  createEdgeId,
  PropertyDefinition,
  PropertyValue,
  createInstant,
  unwrap,
} from '@canopy/types';

// Test helpers to replace missing factories
function createNode(props: Record<string, unknown>) {
  return {
    id: createNodeId(),
    type: asTypeId('test'),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...props,
    properties:
      props.properties && !(props.properties instanceof Map)
        ? new Map(Object.entries(props.properties as Record<string, PropertyValue>))
        : props.properties || new Map(),
  };
}

function createEdge(props: Record<string, unknown>) {
  return {
    id: createEdgeId(),
    type: asTypeId('test'),
    source: createNodeId(),
    target: createNodeId(),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...props,
    properties:
      props.properties && !(props.properties instanceof Map)
        ? new Map(Object.entries(props.properties as Record<string, PropertyValue>))
        : props.properties || new Map(),
  };
}

describe('validation', () => {
  // Setup helper to create a graph with a type definition
  function createGraphWithTypes() {
    let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

    // Define a "Person" node type
    const personProps: readonly PropertyDefinition[] = [
      { name: 'name', valueKind: 'text', required: true, description: 'Full Name' },
      { name: 'age', valueKind: 'number', required: false, description: 'Age' },
    ];

    const personTypeNode = createNode({
      id: asNodeId('type-person'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: { kind: 'text', value: 'Person' },
        properties: { kind: 'text', value: JSON.stringify(personProps) },
      },
    });

    g = unwrap(addNode(g, personTypeNode));

    // Define a "Task" node type
    const taskTypeNode = createNode({
      id: asNodeId('type-task'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: { kind: 'text', value: 'Task' },
      },
    });
    g = unwrap(addNode(g, taskTypeNode));

    // Define "AssignedTo" edge type
    const assignedToProps: readonly PropertyDefinition[] = [
      { name: 'role', valueKind: 'text', required: true, description: 'Role' },
    ];
    const assignedToTypeNode = createNode({
      id: asNodeId('edge-assigned-to'),
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {
        name: { kind: 'text', value: 'Assigned To' },
        properties: { kind: 'text', value: JSON.stringify(assignedToProps) },
        sourceTypes: { kind: 'list', items: [{ kind: 'text', value: 'type-task' }] },
        targetTypes: { kind: 'list', items: [{ kind: 'text', value: 'type-person' }] },
      },
    });
    g = unwrap(addNode(g, assignedToTypeNode));

    return g;
  }

  it('validates a valid node', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {
        name: { kind: 'text', value: 'Alice' },
        age: { kind: 'number', value: 30 },
      },
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validates a node missing required property', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {
        age: { kind: 'number', value: 30 },
      },
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Missing required property');
    expect(result.errors[0].path).toContain('name');
  });

  it('validates a node with wrong property type', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {
        name: { kind: 'text', value: 'Alice' },
        age: { kind: 'text', value: 'Thirty' }, // Should be number
      },
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('expected type');
    expect(result.errors[0].actual).toBe('text');
  });

  it('passes validation if type definition is missing', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('unknown-type'),
      properties: {},
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(true);
  });

  it('validates a valid edge', () => {
    let g = createGraphWithTypes();
    const task = createNode({ id: asNodeId('task1'), type: asTypeId('type-task') });
    const person = createNode({ id: asNodeId('person1'), type: asTypeId('type-person') });
    g = unwrap(addNode(g, task));
    g = unwrap(addNode(g, person));

    const edge = createEdge({
      type: asTypeId('edge-assigned-to'),
      source: task.id,
      target: person.id,
      properties: {
        role: { kind: 'text', value: 'Owner' },
      },
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('validates edge with invalid source type', () => {
    let g = createGraphWithTypes();
    const person1 = createNode({ id: asNodeId('person1'), type: asTypeId('type-person') });
    const person2 = createNode({ id: asNodeId('person2'), type: asTypeId('type-person') });
    g = unwrap(addNode(g, person1));
    g = unwrap(addNode(g, person2));

    // AssignedTo expects Source=Task, Target=Person. Here Source=Person.
    const edge = createEdge({
      type: asTypeId('edge-assigned-to'),
      source: person1.id,
      target: person2.id,
      properties: {
        role: { kind: 'text', value: 'Owner' },
      },
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Source node type');
  });

  it('validates edge with missing required property', () => {
    let g = createGraphWithTypes();
    const task = createNode({ id: asNodeId('task1'), type: asTypeId('type-task') });
    const person = createNode({ id: asNodeId('person1'), type: asTypeId('type-person') });
    g = unwrap(addNode(g, task));
    g = unwrap(addNode(g, person));

    const edge = createEdge({
      type: asTypeId('edge-assigned-to'),
      source: task.id,
      target: person.id,
      properties: {}, // Missing 'role'
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('Missing required property');
  });
});
