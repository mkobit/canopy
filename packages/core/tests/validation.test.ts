import { describe, it, expect } from 'bun:test';
import { createGraph } from '../src/graph';
import { addNode } from '../src/ops';
import { validateNode, validateEdge, matchesCondition, isEdgeCompatible, validatePropertyByType } from '../src/validation';
import type { EdgeTypeDefinition } from '@canopy/types';
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
  asDeviceId,
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
      name: 'Person',
      properties: JSON.stringify(personProperties),
    },
  });

  g = unwrap(
    addNode(g, personTypeNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
  ).graph;

  // Define a "Task" node type
  const taskTypeNode = createNode({
    id: asNodeId('type-task'),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: {
      name: 'Task',
    },
  });
  g = unwrap(
    addNode(g, taskTypeNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
  ).graph;

  // Define "AssignedTo" edge type
  const assignedToProperties: readonly PropertyDefinition[] = [
    { name: 'role', valueKind: 'text', required: true, description: 'Role' },
  ];
  const assignedToTypeNode = createNode({
    id: asNodeId('edge-assigned-to'),
    type: SYSTEM_IDS.EDGE_TYPE,
    properties: {
      name: 'Assigned To',
      properties: JSON.stringify(assignedToProperties),
      sourceTypes: ['type-task'],
      targetTypes: ['type-person'],
    },
  });
  g = unwrap(
    addNode(g, assignedToTypeNode, {
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    }),
  ).graph;

  return g;
}

describe('validation', () => {
  it('validates a valid node', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {
        name: 'Alice',
        age: 30,
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
        age: 30,
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
        name: 'Alice',
        age: 'Thirty', // Should be number
      },
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('expected type');
    expect(result.errors[0].actual).toBe('string');
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
    g = unwrap(
      addNode(g, task, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    g = unwrap(
      addNode(g, person, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const edge = createEdge({
      type: asTypeId('edge-assigned-to'),
      source: task.id,
      target: person.id,
      properties: {
        role: 'Owner',
      },
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('validates edge with invalid source type', () => {
    let g = createGraphWithTypes();
    const person1 = createNode({ id: asNodeId('person1'), type: asTypeId('type-person') });
    const person2 = createNode({ id: asNodeId('person2'), type: asTypeId('type-person') });
    g = unwrap(
      addNode(g, person1, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    g = unwrap(
      addNode(g, person2, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // AssignedTo expects Source=Task, Target=Person. Here Source=Person.
    const edge = createEdge({
      type: asTypeId('edge-assigned-to'),
      source: person1.id,
      target: person2.id,
      properties: {
        role: 'Owner',
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
    g = unwrap(
      addNode(g, task, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    g = unwrap(
      addNode(g, person, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

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
        name: 'New Type',
        namespace: 'user',
        description: 'Description',
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
        name: 123, // Should be text
        namespace: 'user',
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

describe('validOutgoingEdges / validIncomingEdges', () => {
  const DEVICE = asDeviceId('00000000-0000-0000-0000-000000000000');

  function createGraphWithEdgeConstraints() {
    let g = unwrap(createGraph(createGraphId(), 'Constrained Graph'));

    // Define an edge type "manages"
    const managesEdgeType = createNode({
      id: asNodeId('edge-manages'),
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {
        name: 'Manages',
        namespace: 'user',
      },
    });
    g = unwrap(addNode(g, managesEdgeType, { deviceId: DEVICE })).graph;

    // Define an edge type "reports-to"
    const reportsToEdgeType = createNode({
      id: asNodeId('edge-reports-to'),
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {
        name: 'Reports To',
        namespace: 'user',
      },
    });
    g = unwrap(addNode(g, reportsToEdgeType, { deviceId: DEVICE })).graph;

    // Define "Manager" node type — can only have "manages" as outgoing edges
    const managerType = createNode({
      id: asNodeId('type-manager'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: 'Manager',
        namespace: 'user',
        validOutgoingEdges: ['edge-manages'],
      },
    });
    g = unwrap(addNode(g, managerType, { deviceId: DEVICE })).graph;

    // Define "Employee" node type — can only have "reports-to" as incoming edges
    const employeeType = createNode({
      id: asNodeId('type-employee'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: 'Employee',
        namespace: 'user',
        validIncomingEdges: ['edge-reports-to'],
      },
    });
    g = unwrap(addNode(g, employeeType, { deviceId: DEVICE })).graph;

    // Define "Generic" node type — no edge constraints
    const genericType = createNode({
      id: asNodeId('type-generic'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {
        name: 'Generic',
        namespace: 'user',
      },
    });
    g = unwrap(addNode(g, genericType, { deviceId: DEVICE })).graph;

    return g;
  }

  it('allows edge when source type permits outgoing edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const manager = createNode({ id: asNodeId('mgr1'), type: asTypeId('type-manager') });
    const generic = createNode({ id: asNodeId('gen1'), type: asTypeId('type-generic') });
    g = unwrap(addNode(g, manager, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;

    const edge = createEdge({
      type: asTypeId('edge-manages'),
      source: manager.id,
      target: generic.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('rejects edge when source type does not permit outgoing edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const manager = createNode({ id: asNodeId('mgr1'), type: asTypeId('type-manager') });
    const generic = createNode({ id: asNodeId('gen1'), type: asTypeId('type-generic') });
    g = unwrap(addNode(g, manager, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;

    // Manager only allows "manages" outgoing, not "reports-to"
    const edge = createEdge({
      type: asTypeId('edge-reports-to'),
      source: manager.id,
      target: generic.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain('does not allow outgoing edge type');
  });

  it('allows edge when target type permits incoming edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const generic = createNode({ id: asNodeId('gen1'), type: asTypeId('type-generic') });
    const employee = createNode({ id: asNodeId('emp1'), type: asTypeId('type-employee') });
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, employee, { deviceId: DEVICE })).graph;

    const edge = createEdge({
      type: asTypeId('edge-reports-to'),
      source: generic.id,
      target: employee.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('rejects edge when target type does not permit incoming edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const generic = createNode({ id: asNodeId('gen1'), type: asTypeId('type-generic') });
    const employee = createNode({ id: asNodeId('emp1'), type: asTypeId('type-employee') });
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, employee, { deviceId: DEVICE })).graph;

    // Employee only allows "reports-to" incoming, not "manages"
    const edge = createEdge({
      type: asTypeId('edge-manages'),
      source: generic.id,
      target: employee.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain('does not allow incoming edge type');
  });

  it('skips node-type edge constraints when type has no restrictions', () => {
    let g = createGraphWithEdgeConstraints();
    const gen1 = createNode({ id: asNodeId('gen1'), type: asTypeId('type-generic') });
    const gen2 = createNode({ id: asNodeId('gen2'), type: asTypeId('type-generic') });
    g = unwrap(addNode(g, gen1, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, gen2, { deviceId: DEVICE })).graph;

    // Generic has no edge constraints, any edge type is fine
    const edge = createEdge({
      type: asTypeId('edge-manages'),
      source: gen1.id,
      target: gen2.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });
});

describe('matchesCondition', () => {
  it('returns true for a full match', () => {
    const payload = { a: 1, b: 'two', c: true };
    const condition = JSON.stringify({ a: 1, b: 'two' });
    expect(matchesCondition(payload, condition)).toBe(true);
  });

  it('returns true for an empty condition', () => {
    const payload = { a: 1 };
    const condition = JSON.stringify({});
    expect(matchesCondition(payload, condition)).toBe(true);
  });

  it('returns false for a partial match (missing key in payload)', () => {
    const payload = { a: 1 };
    const condition = JSON.stringify({ a: 1, b: 'two' });
    expect(matchesCondition(payload, condition)).toBe(false);
  });

  it('returns false for a partial match (mismatched value)', () => {
    const payload = { a: 1, b: 'three' };
    const condition = JSON.stringify({ a: 1, b: 'two' });
    expect(matchesCondition(payload, condition)).toBe(false);
  });

  it('returns false for malformed JSON string', () => {
    const payload = { a: 1 };
    const condition = '{ a: 1, b: "two" '; // Missing closing brace and quotes around keys
    expect(matchesCondition(payload, condition)).toBe(false);
  });

  it('returns false for condition that parses to an array', () => {
    const payload = { a: 1 };
    const condition = JSON.stringify([1, 2, 3]);
    expect(matchesCondition(payload, condition)).toBe(false);
  });

  it('returns false for condition that parses to null', () => {
    const payload = { a: 1 };
    const condition = JSON.stringify(null);
    expect(matchesCondition(payload, condition)).toBe(false);
  });
});

describe('validatePropertyByType', () => {
  const DEVICE = asDeviceId('00000000-0000-0000-0000-000000000000');

  function setupGraph() {
    let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

    // Add a PropertyType node
    const propType = createNode({
      id: asNodeId('prop-age'),
      type: asTypeId('system:nodetype:property-type'),
      properties: {
        name: 'age',
        valueKind: 'number',
        namespace: 'user',
      },
    });

    g = unwrap(addNode(g, propType, { deviceId: DEVICE })).graph;

    return { graph: g, propTypeId: propType.id };
  }

  it('returns valid: true when value matches property type kind', () => {
    const { graph, propTypeId } = setupGraph();

    const result = validatePropertyByType(graph, propTypeId, 42);

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('returns valid: false when value does not match property type kind', () => {
    const { graph, propTypeId } = setupGraph();

    const result = validatePropertyByType(graph, propTypeId, 'forty-two');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]?.message).toContain("expected type 'number'");
  });

  it('returns error when PropertyType node is missing', () => {
    const { graph } = setupGraph();
    const missingId = asNodeId('missing-prop-type');

    const result = validatePropertyByType(graph, missingId, 42);

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain(`PropertyType node '${missingId}' not found`);
  });

  it('returns error when PropertyType node is missing valueKind', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

    const invalidPropType = createNode({
      id: asNodeId('prop-invalid'),
      type: asTypeId('system:nodetype:property-type'),
      properties: {
        name: 'invalidProp',
        namespace: 'user',
      },
    });
    g = unwrap(addNode(g, invalidPropType, { deviceId: DEVICE })).graph;

    const result = validatePropertyByType(g, invalidPropType.id, 'some string');

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.message).toContain(`missing 'valueKind' property`);
  });

  it('handles array values correctly', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
    const listPropType = createNode({
      id: asNodeId('prop-list'),
      type: asTypeId('system:nodetype:property-type'),
      properties: { name: 'items', valueKind: 'list' },
    });
    g = unwrap(addNode(g, listPropType, { deviceId: DEVICE })).graph;

    expect(validatePropertyByType(g, listPropType.id, ['a', 'b']).valid).toBe(true);
    expect(validatePropertyByType(g, listPropType.id, 'not-a-list').valid).toBe(false);
  });
});

describe('transitive and inverse edge type extraction', () => {
  const DEVICE = asDeviceId('00000000-0000-0000-0000-000000000000');

  it('extracts transitive=true from edge type definition', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test'));

    const transitiveEdgeType = createNode({
      id: asNodeId('edge-descendant-of'),
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {
        name: 'Descendant Of',
        namespace: 'user',
        transitive: true,
      },
    });
    g = unwrap(addNode(g, transitiveEdgeType, { deviceId: DEVICE })).graph;

    // Verify the definition node exists and has the transitive property
    const defNode = g.nodes.get(asNodeId('edge-descendant-of'));
    expect(defNode).toBeDefined();
    expect(defNode?.properties.get('transitive')).toBe(true);
  });

  it('extracts inverse reference from edge type definition', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test'));

    const parentOfEdge = createNode({
      id: asNodeId('edge-parent-of'),
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {
        name: 'Parent Of',
        namespace: 'user',
        inverse: 'edge-child-of',
      },
    });
    g = unwrap(addNode(g, parentOfEdge, { deviceId: DEVICE })).graph;

    const defNode = g.nodes.get(asNodeId('edge-parent-of'));
    expect(defNode).toBeDefined();
    expect(defNode?.properties.get('inverse')).toBe('edge-child-of');
  });

  it('validates edge type node with transitive and inverse properties', () => {
    const g = unwrap(createGraph(createGraphId(), 'System'));

    const edgeTypeNode = createNode({
      type: SYSTEM_IDS.EDGE_TYPE,
      properties: {
        name: 'Test Edge',
        namespace: 'user',
        transitive: true,
        inverse: 'some-edge-type',
      },
    });

    // Should be valid — transitive is boolean, inverse is reference (string)
    const result = validateNode(g, edgeTypeNode);
    expect(result.valid).toBe(true);
  });
});

describe('isEdgeCompatible', () => {
  const mockDef = (sourceTypes: string[], targetTypes: string[]): EdgeTypeDefinition => ({
    id: asTypeId('test-edge-type'),
    name: 'Test Edge Type',
    namespace: 'user',
    properties: [],
    sourceTypes: sourceTypes.map(asTypeId),
    targetTypes: targetTypes.map(asTypeId),
    transitive: false,
    inverse: undefined,
  });

  const t1 = asTypeId('type-1');
  const t2 = asTypeId('type-2');
  const t3 = asTypeId('type-3');

  it('allows explicit matches for both source and target', () => {
    const def = mockDef(['type-1', 'type-2'], ['type-3']);
    expect(isEdgeCompatible(def, t1, t3)).toBe(true);
    expect(isEdgeCompatible(def, t2, t3)).toBe(true);
  });

  it('rejects when source does not match', () => {
    const def = mockDef(['type-1'], ['type-3']);
    expect(isEdgeCompatible(def, t2, t3)).toBe(false);
  });

  it('rejects when target does not match', () => {
    const def = mockDef(['type-1'], ['type-3']);
    expect(isEdgeCompatible(def, t1, t2)).toBe(false);
  });

  it('rejects when both source and target do not match', () => {
    const def = mockDef(['type-1'], ['type-3']);
    expect(isEdgeCompatible(def, t2, t2)).toBe(false);
  });

  it('allows wildcard source (empty list)', () => {
    const def = mockDef([], ['type-3']);
    expect(isEdgeCompatible(def, t1, t3)).toBe(true);
    expect(isEdgeCompatible(def, t2, t3)).toBe(true);
  });

  it('allows wildcard target (empty list)', () => {
    const def = mockDef(['type-1'], []);
    expect(isEdgeCompatible(def, t1, t2)).toBe(true);
    expect(isEdgeCompatible(def, t1, t3)).toBe(true);
  });

  it('allows wildcard source and target (both empty lists)', () => {
    const def = mockDef([], []);
    expect(isEdgeCompatible(def, t1, t2)).toBe(true);
    expect(isEdgeCompatible(def, t2, t3)).toBe(true);
  });
});
