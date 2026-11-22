import { describe, it, expect } from 'bun:test';
import { createGraph } from '../src/create-graph';
import { addNode, removeNode } from '../src/ops';
import {
  validateNode,
  validateEdge,
  matchesCondition,
  isEdgeCompatible,
  validatePropertyByType,
} from '../src/validation';
import { projectGraph } from '../src/projection';
import { getNodesOfShape, getShape, resolveShape } from '../src/queries';
import type { ShapeDefinition, Node, Edge, GraphEvent } from '@canopy/graph';
import { SYSTEM_IDS } from '../src/system';
import {
  asNodeId,
  asEdgeId,
  asShapeId,
  createNodeId,
  createGraphId,
  createEdgeId,
  createEventId,
  PropertyDefinition,
  PropertyValue,
  createInstant,
  unwrap,
  isErr,
  isOk,
  asDeviceId,
  asNamespace,
} from '@canopy/graph';

// Test helpers to replace missing factories
function createNode(properties: Record<string, unknown>): Node {
  return {
    id: createNodeId(),
    shape: asShapeId('test'),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
    ...properties,
    properties:
      properties.properties && !(properties.properties instanceof Map)
        ? new Map(Object.entries(properties.properties as Record<string, PropertyValue>))
        : (properties.properties as Map<string, PropertyValue>) || new Map<string, PropertyValue>(),
  } as unknown as Node;
}

function createEdge(properties: Record<string, unknown>): Edge {
  return {
    id: createEdgeId(),
    shape: asShapeId('test'),
    source: createNodeId(),
    target: createNodeId(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
    ...properties,
    properties:
      properties.properties && !(properties.properties instanceof Map)
        ? new Map(Object.entries(properties.properties as Record<string, PropertyValue>))
        : (properties.properties as Map<string, PropertyValue>) || new Map<string, PropertyValue>(),
  } as unknown as Edge;
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
    shape: SYSTEM_IDS.SHAPE,
    properties: {
      name: 'Person',
      entityKind: 'node',
      properties: JSON.stringify(personProperties),
    },
  });

  g = unwrap(
    addNode(g, personTypeNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
  ).graph;

  // Define a "Task" node type
  const taskTypeNode = createNode({
    id: asNodeId('type-task'),
    shape: SYSTEM_IDS.SHAPE,
    properties: {
      name: 'Task',
      entityKind: 'node',
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
    shape: SYSTEM_IDS.SHAPE,
    properties: {
      name: 'Assigned To',
      entityKind: 'edge',
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
      shape: asShapeId('type-person'),
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
      shape: asShapeId('type-person'),
      properties: {
        age: 30,
      },
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(false);
    const [firstError] = result.errors;
    if (firstError === undefined) throw new Error('Expected error');
    expect(firstError.message).toContain('Missing required property');
    expect(firstError.path).toContain('name');
  });

  it('validates a node with wrong property type', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      shape: asShapeId('type-person'),
      properties: {
        name: 'Alice',
        age: 'Thirty', // Should be number
      },
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(false);
    const [firstError] = result.errors;
    if (firstError === undefined) throw new Error('Expected error');
    expect(firstError.message).toContain('expected type');
    expect(firstError.actual).toBe('string');
  });

  it('rejects validation if shape definition is missing (Rule 2: SHAPE_NOT_FOUND)', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      shape: asShapeId('unknown-type'),
      properties: {},
    });

    const result = validateNode(g, node);
    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe('SHAPE_NOT_FOUND');
  });

  it('validates a valid edge', () => {
    let g = createGraphWithTypes();
    const task = createNode({ id: asNodeId('task1'), shape: asShapeId('type-task') });
    const person = createNode({ id: asNodeId('person1'), shape: asShapeId('type-person') });
    g = unwrap(
      addNode(g, task, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    g = unwrap(
      addNode(g, person, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const edge = createEdge({
      shape: asShapeId('edge-assigned-to'),
      source: task.id,
      target: person.id,
      properties: {
        role: 'Owner',
      },
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('emits warning for edge with mismatched source shape (Rule 14)', () => {
    let g = createGraphWithTypes();
    const person1 = createNode({ id: asNodeId('person1'), shape: asShapeId('type-person') });
    const person2 = createNode({ id: asNodeId('person2'), shape: asShapeId('type-person') });
    g = unwrap(
      addNode(g, person1, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    g = unwrap(
      addNode(g, person2, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // AssignedTo expects Source=Task, Target=Person. Here Source=Person.
    const edge = createEdge({
      shape: asShapeId('edge-assigned-to'),
      source: person1.id,
      target: person2.id,
      properties: {
        role: 'Owner',
      },
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.code).toBe('EDGE_ENDPOINT_SHAPE');
    expect(result.warnings[0]?.message).toContain('Source node shape');
  });

  it('validates edge with missing required property', () => {
    let g = createGraphWithTypes();
    const task = createNode({ id: asNodeId('task1'), shape: asShapeId('type-task') });
    const person = createNode({ id: asNodeId('person1'), shape: asShapeId('type-person') });
    g = unwrap(
      addNode(g, task, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    g = unwrap(
      addNode(g, person, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const edge = createEdge({
      shape: asShapeId('edge-assigned-to'),
      source: task.id,
      target: person.id,
      properties: {}, // Missing 'role'
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(false);
    const [firstError] = result.errors;
    if (firstError === undefined) throw new Error('Expected error');
    expect(firstError.message).toContain('Missing required property');
  });

  it('validates a malformed NODE_TYPE node against the system definition', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));
    // Graph is already bootstrapped with system types.

    const malformedNode = createNode({
      shape: SYSTEM_IDS.SHAPE,
      properties: {}, // Missing 'name', etc.
    });

    const result = validateNode(g, malformedNode);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(
      result.errors.some((error) => error.message.includes("Missing required property 'name'")),
    ).toBe(true);
  });

  it('validates a valid NODE_TYPE node against the system definition', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const validNode = createNode({
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'New Type',
        namespace: 'user',
        entityKind: 'node',
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
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 123, // Should be text
        namespace: 'user',
      },
    });

    const result = validateNode(g, invalidNode);
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.includes("expected type 'text'"))).toBe(
      true,
    );
  });

  it('validates a malformed EDGE_TYPE node against the system definition', () => {
    const g = unwrap(createGraph(createGraphId(), 'System Graph'));

    const malformedNode = createNode({
      shape: SYSTEM_IDS.SHAPE,
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
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Manages',
        namespace: 'user',
        entityKind: 'edge',
      },
    });
    g = unwrap(addNode(g, managesEdgeType, { deviceId: DEVICE })).graph;

    // Define an edge type "reports-to"
    const reportsToEdgeType = createNode({
      id: asNodeId('edge-reports-to'),
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Reports To',
        namespace: 'user',
        entityKind: 'edge',
      },
    });
    g = unwrap(addNode(g, reportsToEdgeType, { deviceId: DEVICE })).graph;

    // Define "Manager" node type — can only have "manages" as outgoing edges
    const managerType = createNode({
      id: asNodeId('type-manager'),
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Manager',
        namespace: 'user',
        entityKind: 'node',
        validOutgoingEdges: ['edge-manages'],
      },
    });
    g = unwrap(addNode(g, managerType, { deviceId: DEVICE })).graph;

    // Define "Employee" node type — can only have "reports-to" as incoming edges
    const employeeType = createNode({
      id: asNodeId('type-employee'),
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Employee',
        namespace: 'user',
        entityKind: 'node',
        validIncomingEdges: ['edge-reports-to'],
      },
    });
    g = unwrap(addNode(g, employeeType, { deviceId: DEVICE })).graph;

    // Define "Generic" node type — no edge constraints
    const genericType = createNode({
      id: asNodeId('type-generic'),
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Generic',
        namespace: 'user',
        entityKind: 'node',
      },
    });
    g = unwrap(addNode(g, genericType, { deviceId: DEVICE })).graph;

    return g;
  }

  it('allows edge when source type permits outgoing edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const manager = createNode({ id: asNodeId('mgr1'), shape: asShapeId('type-manager') });
    const generic = createNode({ id: asNodeId('gen1'), shape: asShapeId('type-generic') });
    g = unwrap(addNode(g, manager, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;

    const edge = createEdge({
      shape: asShapeId('edge-manages'),
      source: manager.id,
      target: generic.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('rejects edge when source type does not permit outgoing edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const manager = createNode({ id: asNodeId('mgr1'), shape: asShapeId('type-manager') });
    const generic = createNode({ id: asNodeId('gen1'), shape: asShapeId('type-generic') });
    g = unwrap(addNode(g, manager, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;

    // Manager only allows "manages" outgoing, not "reports-to"
    const edge = createEdge({
      shape: asShapeId('edge-reports-to'),
      source: manager.id,
      target: generic.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
    expect(result.warnings[0]?.code).toBe('EDGE_NOT_ALLOWED');
    expect(result.warnings[0]?.message).toContain('does not allow outgoing edge shape');
  });

  it('allows edge when target type permits incoming edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const generic = createNode({ id: asNodeId('gen1'), shape: asShapeId('type-generic') });
    const employee = createNode({ id: asNodeId('emp1'), shape: asShapeId('type-employee') });
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, employee, { deviceId: DEVICE })).graph;

    const edge = createEdge({
      shape: asShapeId('edge-reports-to'),
      source: generic.id,
      target: employee.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
  });

  it('warns when target type does not permit incoming edge type', () => {
    let g = createGraphWithEdgeConstraints();
    const generic = createNode({ id: asNodeId('gen1'), shape: asShapeId('type-generic') });
    const employee = createNode({ id: asNodeId('emp1'), shape: asShapeId('type-employee') });
    g = unwrap(addNode(g, generic, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, employee, { deviceId: DEVICE })).graph;

    // Employee only allows "reports-to" incoming, not "manages"
    const edge = createEdge({
      shape: asShapeId('edge-manages'),
      source: generic.id,
      target: employee.id,
    });

    const result = validateEdge(g, edge);
    expect(result.valid).toBe(true);
    expect(result.warnings[0]?.code).toBe('EDGE_NOT_ALLOWED');
    expect(result.warnings[0]?.message).toContain('does not allow incoming edge shape');
  });

  it('skips node-type edge constraints when type has no restrictions', () => {
    let g = createGraphWithEdgeConstraints();
    const gen1 = createNode({ id: asNodeId('gen1'), shape: asShapeId('type-generic') });
    const gen2 = createNode({ id: asNodeId('gen2'), shape: asShapeId('type-generic') });
    g = unwrap(addNode(g, gen1, { deviceId: DEVICE })).graph;
    g = unwrap(addNode(g, gen2, { deviceId: DEVICE })).graph;

    // Generic has no edge constraints, any edge type is fine
    const edge = createEdge({
      shape: asShapeId('edge-manages'),
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
    const propertyType = createNode({
      id: asNodeId('prop-age'),
      shape: SYSTEM_IDS.PROPERTY_TYPE,
      properties: {
        name: 'age',
        valueKind: 'number',
        namespace: 'user',
      },
    });

    g = unwrap(addNode(g, propertyType, { deviceId: DEVICE })).graph;

    return { graph: g, propTypeId: propertyType.id };
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

    const invalidPropertyType = createNode({
      id: asNodeId('prop-invalid'),
      shape: SYSTEM_IDS.PROPERTY_TYPE,
      properties: {
        name: 'invalidProp',
        namespace: 'user',
      },
    });
    g = unwrap(addNode(g, invalidPropertyType, { deviceId: DEVICE })).graph;

    const result = validatePropertyByType(g, invalidPropertyType.id, 'some string');

    expect(result.valid).toBe(false);
    expect(result.errors[0]?.code).toBe('PROPERTY_TYPE_MALFORMED');
  });

  it('handles array values correctly', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
    const listPropertyType = createNode({
      id: asNodeId('prop-list'),
      shape: SYSTEM_IDS.PROPERTY_TYPE,
      properties: { name: 'items', valueKind: 'list' },
    });
    g = unwrap(addNode(g, listPropertyType, { deviceId: DEVICE })).graph;

    expect(validatePropertyByType(g, listPropertyType.id, ['a', 'b']).valid).toBe(true);
    expect(validatePropertyByType(g, listPropertyType.id, 'not-a-list').valid).toBe(false);
  });
});

describe('transitive and inverse edge type extraction', () => {
  const DEVICE = asDeviceId('00000000-0000-0000-0000-000000000000');

  it('extracts transitive=true from edge type definition', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test'));

    const transitiveEdgeType = createNode({
      id: asNodeId('edge-descendant-of'),
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Descendant Of',
        namespace: 'user',
        transitive: true,
      },
    });
    g = unwrap(addNode(g, transitiveEdgeType, { deviceId: DEVICE })).graph;

    // Verify the definition node exists and has the transitive property
    const definitionNode = g.nodes.get(asNodeId('edge-descendant-of'));
    expect(definitionNode).toBeDefined();
    expect(definitionNode?.properties.get('transitive')).toBe(true);
  });

  it('extracts inverse reference from edge type definition', () => {
    let g = unwrap(createGraph(createGraphId(), 'Test'));

    const parentOfEdge = createNode({
      id: asNodeId('edge-parent-of'),
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Parent Of',
        namespace: 'user',
        inverse: 'edge-child-of',
      },
    });
    g = unwrap(addNode(g, parentOfEdge, { deviceId: DEVICE })).graph;

    const definitionNode = g.nodes.get(asNodeId('edge-parent-of'));
    expect(definitionNode).toBeDefined();
    expect(definitionNode?.properties.get('inverse')).toBe('edge-child-of');
  });

  it('validates edge type node with transitive and inverse properties', () => {
    const g = unwrap(createGraph(createGraphId(), 'System'));

    const edgeTypeNode = createNode({
      shape: SYSTEM_IDS.SHAPE,
      properties: {
        name: 'Test Edge',
        namespace: 'user',
        entityKind: 'edge',
        transitive: true,
        inverse: SYSTEM_IDS.EDGE_CHILD_OF,
      },
    });

    // Should be valid — transitive is boolean, inverse is reference (string)
    const result = validateNode(g, edgeTypeNode);
    expect(result.valid).toBe(true);
  });
});

describe('isEdgeCompatible', () => {
  const mockDefinition = (sourceTypes: string[], targetTypes: string[]): ShapeDefinition => ({
    id: asShapeId('test-edge-type'),
    name: 'Test Edge Type',
    namespace: asNamespace('user'),
    description: undefined,
    entityKind: 'edge',
    closed: false,
    properties: [],
    status: 'active',
    edge: {
      sourceTypes: sourceTypes.map(asShapeId),
      targetTypes: targetTypes.map(asShapeId),
      transitive: false,
      inverse: undefined,
    },
  });

  const t1 = asShapeId('type-1');
  const t2 = asShapeId('type-2');
  const t3 = asShapeId('type-3');

  it('allows explicit matches for both source and target', () => {
    const definition = mockDefinition(['type-1', 'type-2'], ['type-3']);
    expect(isEdgeCompatible(definition, t1, t3)).toBe(true);
    expect(isEdgeCompatible(definition, t2, t3)).toBe(true);
  });

  it('rejects when source does not match', () => {
    const definition = mockDefinition(['type-1'], ['type-3']);
    expect(isEdgeCompatible(definition, t2, t3)).toBe(false);
  });

  it('rejects when target does not match', () => {
    const definition = mockDefinition(['type-1'], ['type-3']);
    expect(isEdgeCompatible(definition, t1, t2)).toBe(false);
  });

  it('rejects when both source and target do not match', () => {
    const definition = mockDefinition(['type-1'], ['type-3']);
    expect(isEdgeCompatible(definition, t2, t2)).toBe(false);
  });

  it('allows wildcard source (empty list)', () => {
    const definition = mockDefinition([], ['type-3']);
    expect(isEdgeCompatible(definition, t1, t3)).toBe(true);
    expect(isEdgeCompatible(definition, t2, t3)).toBe(true);
  });

  it('allows wildcard target (empty list)', () => {
    const definition = mockDefinition(['type-1'], []);
    expect(isEdgeCompatible(definition, t1, t2)).toBe(true);
    expect(isEdgeCompatible(definition, t1, t3)).toBe(true);
  });

  it('allows wildcard source and target (both empty lists)', () => {
    const definition = mockDefinition([], []);
    expect(isEdgeCompatible(definition, t1, t2)).toBe(true);
    expect(isEdgeCompatible(definition, t2, t3)).toBe(true);
  });
});

describe('durable schema retention and type lifecycle', () => {
  const deviceId = asDeviceId('00000000-0000-0000-0000-000000000000');

  describe('ShapePropertyBindingSchema', () => {
    it('decodes legacy flat PropertyDefinition into an inline binding', async () => {
      const { ShapePropertyBindingSchema } = await import('../src/schemas');
      const parsed = ShapePropertyBindingSchema.parse({
        name: 'title',
        valueKind: 'text',
        required: true,
      });
      expect(parsed.kind).toBe('inline');
      if (parsed.kind !== 'inline') {
        return;
      }

      expect(parsed.definition.name).toBe('title');
      expect(parsed.definition.valueKind).toBe('text');
    });
  });

  describe('extraction helpers with status', () => {
    it('extracts status defaulting to active when omitted', () => {
      let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
      const nodeShapeNode = createNode({
        id: asNodeId('test-active-type'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'ActiveType',
          entityKind: 'node',
        },
      });
      g = unwrap(addNode(g, nodeShapeNode, { deviceId: createNodeId() as never })).graph;
      const nodeShape = unwrap(resolveShape(g, asShapeId('test-active-type')));
      expect(nodeShape.status).toBe('active');

      const edgeShapeNode = createNode({
        id: asNodeId('test-active-edge-type'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'ActiveEdgeType',
          entityKind: 'edge',
        },
      });
      g = unwrap(addNode(g, edgeShapeNode, { deviceId: createNodeId() as never })).graph;
      const edgeShape = unwrap(resolveShape(g, asShapeId('test-active-edge-type')));
      expect(edgeShape.status).toBe('active');
    });

    it('extracts status as inactive when property is inactive', () => {
      let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
      const nodeShapeNode = createNode({
        id: asNodeId('test-inactive-type'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'InactiveType',
          entityKind: 'node',
          status: 'inactive',
        },
      });
      g = unwrap(addNode(g, nodeShapeNode, { deviceId: createNodeId() as never })).graph;
      const nodeShape = unwrap(resolveShape(g, asShapeId('test-inactive-type')));
      expect(nodeShape.status).toBe('inactive');

      const edgeShapeNode = createNode({
        id: asNodeId('test-inactive-edge-type'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'InactiveEdgeType',
          entityKind: 'edge',
          status: 'inactive',
        },
      });
      g = unwrap(addNode(g, edgeShapeNode, { deviceId: createNodeId() as never })).graph;
      const edgeShape = unwrap(resolveShape(g, asShapeId('test-inactive-edge-type')));
      expect(edgeShape.status).toBe('inactive');
    });
  });

  describe('inactive node type validation and lifecycle', () => {
    it('rejects validateNode for inactive type with TYPE_INACTIVE error', () => {
      let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
      const inactiveTypeNode = createNode({
        id: asNodeId('type-retired-plugin'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'RetiredPluginNode',
          entityKind: 'node',
          status: 'inactive',
        },
      });
      g = unwrap(addNode(g, inactiveTypeNode, { deviceId })).graph;

      const candidateNode = createNode({
        id: asNodeId('candidate-1'),
        shape: asShapeId('type-retired-plugin'),
        properties: {},
      });

      const validation = validateNode(g, candidateNode);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some((error_) => error_.code === 'SHAPE_INACTIVE')).toBe(true);
      expect(validation.errors[0]?.path).toEqual(['shape']);
      expect(validation.errors[0]?.expected).toBe('active');
      expect(validation.errors[0]?.actual).toBe('inactive');
    });

    it('rejects addNode for inactive type with SHAPE_INACTIVE error', () => {
      let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
      const inactiveTypeNode = createNode({
        id: asNodeId('type-retired-plugin'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'RetiredPluginNode',
          entityKind: 'node',
          status: 'inactive',
        },
      });
      g = unwrap(addNode(g, inactiveTypeNode, { deviceId })).graph;

      const candidateNode = createNode({
        id: asNodeId('candidate-2'),
        shape: asShapeId('type-retired-plugin'),
        properties: {},
      });

      const result = addNode(g, candidateNode, { deviceId });
      expect(isErr(result)).toBe(true);
      if (!isErr(result)) return;
      expect(result.error.message).toMatch(/SHAPE_INACTIVE/);
    });

    it('permits query retrieval and deletion of existing nodes with inactive types', () => {
      let g = unwrap(createGraph(createGraphId(), 'Test Graph'));
      const typeNode = createNode({
        id: asNodeId('type-lifecycle-node'),
        shape: SYSTEM_IDS.SHAPE,
        properties: {
          name: 'LifecycleNode',
          status: 'active',
        },
      });
      g = unwrap(addNode(g, typeNode, { deviceId })).graph;

      const existingNode = createNode({
        id: asNodeId('lifecycle-node-1'),
        shape: asShapeId('type-lifecycle-node'),
        properties: {
          title: 'Existing Data',
        },
      });
      g = unwrap(addNode(g, existingNode, { deviceId })).graph;

      const inactiveTypeNode = {
        ...typeNode,
        properties: new Map([...typeNode.properties, ['status', 'inactive']]),
      };
      g = {
        ...g,
        nodes: new Map([...g.nodes, [inactiveTypeNode.id, inactiveTypeNode]]),
      };

      const retrieved = g.nodes.get(asNodeId('lifecycle-node-1'));
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(asNodeId('lifecycle-node-1'));
      expect(retrieved?.properties.get('title')).toBe('Existing Data');

      const byType = getNodesOfShape(g, asShapeId('type-lifecycle-node'));
      expect(byType.length).toBe(1);
      expect(byType[0]?.id).toBe(asNodeId('lifecycle-node-1'));

      const retrievedType = getShape(g, asShapeId('type-lifecycle-node'));
      expect(retrievedType).toBeDefined();

      const removeResult = removeNode(g, asNodeId('lifecycle-node-1'), { deviceId });
      expect(isOk(removeResult)).toBe(true);
      if (!isOk(removeResult)) return;
      expect(removeResult.value.events.some((event) => event.type === 'NodeDeleted')).toBe(true);
      expect(removeResult.value.graph.nodes.has(asNodeId('lifecycle-node-1'))).toBe(false);
    });

    it('replays historical events for inactive types without validation failure', () => {
      const initial = unwrap(createGraph(createGraphId(), 'Test Graph'));
      const typeNodeId = asNodeId('type-historical-plugin');
      const nodeId = asNodeId('historical-node-1');
      const edgeId = asEdgeId('historical-edge-1');

      const timestamp = createInstant();

      const events: readonly GraphEvent[] = [
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: typeNodeId,
          shapeId: SYSTEM_IDS.SHAPE,
          properties: new Map([
            ['name', 'HistoricalPluginType'],
            ['status', 'inactive'],
          ]),
          timestamp,
          deviceId,
        },
        {
          type: 'NodeCreated',
          eventId: createEventId(),
          id: nodeId,
          shapeId: asShapeId('type-historical-plugin'),
          properties: new Map([['title', 'Historical Note']]),
          timestamp,
          deviceId,
        },
        {
          type: 'EdgeCreated',
          eventId: createEventId(),
          id: edgeId,
          shapeId: asShapeId('system:references'),
          source: nodeId,
          target: typeNodeId,
          properties: new Map(),
          timestamp,
          deviceId,
        },
        {
          type: 'NodeDeleted',
          eventId: createEventId(),
          id: nodeId,
          timestamp,
          deviceId,
        },
      ];

      const projectedResult = projectGraph(events, initial);
      expect(isOk(projectedResult)).toBe(true);
      if (!isOk(projectedResult)) return;
      const projected = projectedResult.value;
      expect(projected.nodes.has(typeNodeId)).toBe(true);
      expect(projected.nodes.has(nodeId)).toBe(false);
    });

    it('accepts open nodes and open edges without shape definitions', () => {
      let g = createGraphWithTypes();
      const openSource: Node = {
        id: asNodeId('open-source'),
        properties: new Map([['freeform', 'yes']]),
        metadata: {
          created: createInstant(),
          modified: createInstant(),
          modifiedBy: deviceId,
        },
      };
      const openTarget: Node = {
        id: asNodeId('open-target'),
        properties: new Map(),
        metadata: {
          created: createInstant(),
          modified: createInstant(),
          modifiedBy: deviceId,
        },
      };
      g = unwrap(addNode(g, openSource, { deviceId })).graph;
      g = unwrap(addNode(g, openTarget, { deviceId })).graph;

      expect(validateNode(g, openSource)).toEqual({ valid: true, errors: [], warnings: [] });

      const openEdge: Edge = {
        id: createEdgeId(),
        source: openSource.id,
        target: openTarget.id,
        properties: new Map(),
        metadata: {
          created: createInstant(),
          modified: createInstant(),
          modifiedBy: deviceId,
        },
      };
      expect(validateEdge(g, openEdge)).toEqual({ valid: true, errors: [], warnings: [] });
    });
  });
});
