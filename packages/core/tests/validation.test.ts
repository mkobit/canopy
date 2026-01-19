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
function createNode(properties: Record<string, unknown>) {
  return {
    id: createNodeId(),
    type: asTypeId('test'),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...properties,
    properties:
      properties.properties && !(properties.properties instanceof Map)
        ? new Map(Object.entries(properties.properties as Record<string, PropertyValue>))
        : properties.properties || new Map(),
  };
}

function createEdge(properties: Record<string, unknown>) {
  return {
    id: createEdgeId(),
    type: asTypeId('test'),
    source: createNodeId(),
    target: createNodeId(),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...properties,
    properties:
      properties.properties && !(properties.properties instanceof Map)
        ? new Map(Object.entries(properties.properties as Record<string, PropertyValue>))
        : properties.properties || new Map(),
  };
}

// Setup helper to create a graph with a type definition
function createGraphWithTypes() {
  let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

  // Define a "Person" node type
  const personProperties: readonly PropertyDefinition[] = [
    { name: 'name', valueKind: 'text', required: true, description: 'Full Name' },
    { name: 'age', valueKind: 'number', required: false, description: 'Age' },
  ];

  const personTypeNode = createNode({
    id: asNodeId('type-person'),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: {
      name: { kind: 'text', value: 'Person' },
      properties: { kind: 'text', value: JSON.stringify(personProperties) },
    },
  });

  g = unwrap(addNode(g, personTypeNode)).graph;

  // Define a "Task" node type
  const taskTypeNode = createNode({
    id: asNodeId('type-task'),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: {
      name: { kind: 'text', value: 'Task' },
    },
  });
  g = unwrap(addNode(g, taskTypeNode)).graph;

  // Define "AssignedTo" edge type
  const assignedToProperties: readonly PropertyDefinition[] = [
    { name: 'role', valueKind: 'text', required: true, description: 'Role' },
  ];
  const assignedToTypeNode = createNode({
    id: asNodeId('edge-assigned-to'),
    type: SYSTEM_IDS.EDGE_TYPE,
    properties: {
      name: { kind: 'text', value: 'Assigned To' },
      properties: { kind: 'text', value: JSON.stringify(assignedToProperties) },
      sourceTypes: { kind: 'list', items: [{ kind: 'text', value: 'type-task' }] },
      targetTypes: { kind: 'list', items: [{ kind: 'text', value: 'type-person' }] },
    },
  });
  g = unwrap(addNode(g, assignedToTypeNode)).graph;

  return g;
}

describe('validation', () => {
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
    g = unwrap(addNode(g, task)).graph;
    g = unwrap(addNode(g, person)).graph;

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
    g = unwrap(addNode(g, person1)).graph;
    g = unwrap(addNode(g, person2)).graph;

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
    g = unwrap(addNode(g, task)).graph;
    g = unwrap(addNode(g, person)).graph;

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

  it('validates a malformed NODE_TYPE node against the system definition', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));
    // Graph is already bootstrapped with system types.

    const malformedNode = createNode({
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {}, // Missing 'name', etc.
    });

    const result = validateNode(g, malformedNode);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Missing required property 'name'"))).toBe(
      true,
    );
  });

  it('validates a valid NODE_TYPE node against the system definition', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const validNode = createNode({
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: { kind: 'text', value: 'New Type' },
        description: { kind: 'text', value: 'Description' },
        // 'properties' is optional
      },
    });

    const result = validateNode(g, validNode);
    expect(result.valid).toBe(true);
  });

  it('validates a NODE_TYPE node with wrong property type', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const invalidNode = createNode({
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: { kind: 'number', value: 123 }, // Should be text
      },
    });

    const result = validateNode(g, invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes("expected type 'text'"))).toBe(true);
  });

  it('validates a malformed EDGE_TYPE node against the system definition', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const malformedNode = createNode({
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {}, // Missing 'name'
    });

    const result = validateNode(g, malformedNode);
    expect(result.valid).toBe(false);
  });
});
