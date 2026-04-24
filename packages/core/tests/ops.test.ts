import { describe, it, expect } from 'bun:test';
import { createGraph } from '../src/graph';
import { addNode, updateNode, createEdgeAction } from '../src/ops/index';
import { SYSTEM_IDS } from '../src/system';
import {
  createNodeId,
  asNodeId,
  asTypeId,
  createInstant,
  createGraphId,
  PropertyDefinition,
  PropertyValue,
  unwrap,
  isErr,
  isOk,
  asDeviceId,
  NodePropertiesUpdated,
} from '@canopy/types';

// Test helpers
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

function createGraphWithTypes() {
  // Mock ID and Name as they are required by new createGraph signature
  let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

  const personProperties: readonly PropertyDefinition[] = [
    { name: 'age', valueKind: 'number', required: true, description: 'Age' },
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
  return g;
}

describe('ops with validation', () => {
  it('addNode returns Error if validation fails and validation is enabled', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {}, // missing age
    });

    const result = addNode(g, node, {
      validate: true,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    });
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/Node validation failed/);
    }
  });

  it('addNode succeeds if validation fails but validation is disabled (default)', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {}, // missing age
    });

    const result = addNode(g, node, {
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    });
    expect(isOk(result)).toBe(true);
  });

  it('addNode succeeds if validation passes', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: { age: 20 },
    });

    const result = addNode(g, node, {
      validate: true,
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    });
    expect(isOk(result)).toBe(true);
  });

  it('updateNode returns Error if validation fails', () => {
    let g = createGraphWithTypes();
    const node = createNode({
      id: asNodeId('p1'),
      type: asTypeId('type-person'),
      properties: { age: 20 },
    });
    g = unwrap(
      addNode(g, node, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const result = updateNode(
      g,
      node.id,
      (n) => ({
        ...n,
        properties: new Map(), // remove age
      }),
      { validate: true, deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/Node validation failed/);
    }
  });

  it('updateNode emits only changed properties in the event', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test'));
    const nodeId = createNodeId();
    const node = {
      id: nodeId,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map([
        ['name', 'Alice'],
        ['age', 30],
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
      },
    };
    graph = unwrap(
      addNode(graph, node, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // Update only 'name', leave 'age' unchanged
    const result = unwrap(
      updateNode(
        graph,
        nodeId,
        (n) => ({
          ...n,
          properties: new Map([
            ['name', 'Bob'],
            ['age', 30],
          ]),
        }),
        { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') },
      ),
    );

    const event = result.events[0];
    expect(event.type).toBe('NodePropertiesUpdated');
    // Only 'name' changed, so changes should only contain 'name'
    const changes = (event as NodePropertiesUpdated).changes;
    expect(changes.size).toBe(1);
    expect(changes.get('name')).toBe('Bob');
    expect(changes.has('age')).toBe(false);
  });

  it('updateNode emits empty changes when no properties changed', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test'));
    const nodeId = createNodeId();
    const node = {
      id: nodeId,
      type: SYSTEM_IDS.NODE_TYPE,
      properties: new Map([['name', 'Alice']]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
      },
    };
    graph = unwrap(
      addNode(graph, node, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    // "Update" with same values
    const result = unwrap(
      updateNode(
        graph,
        nodeId,
        (n) => ({
          ...n,
          properties: new Map([['name', 'Alice']]),
        }),
        { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') },
      ),
    );

    const event = result.events[0];
    const changes = (event as NodePropertiesUpdated).changes;
    expect(changes.size).toBe(0);
  });
});

describe('createEdgeAction', () => {
  it('successfully creates an edge and returns the graph and event', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    const sourceNode = createNode({
      id: asNodeId('n1'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {},
    });

    const targetNode = createNode({
      id: asNodeId('n2'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {},
    });

    graph = unwrap(
      addNode(graph, sourceNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
    graph = unwrap(
      addNode(graph, targetNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const result = createEdgeAction(graph, {
      source: asNodeId('n1'),
      target: asNodeId('n2'),
      type: asTypeId('test-edge'),
    });

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.event.type).toBe('EdgeCreated');
      expect(result.value.event.source).toBe(asNodeId('n1'));
      expect(result.value.event.target).toBe(asNodeId('n2'));
      expect(result.value.graph.edges.has(result.value.event.id)).toBe(true);
    }
  });

  it('fails if the source node is missing', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    const targetNode = createNode({
      id: asNodeId('n2'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {},
    });

    graph = unwrap(
      addNode(graph, targetNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const result = createEdgeAction(graph, {
      source: asNodeId('n1'), // n1 is not in the graph
      target: asNodeId('n2'),
      type: asTypeId('test-edge'),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/Source node n1 not found/);
    }
  });

  it('fails if the target node is missing', () => {
    let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));

    const sourceNode = createNode({
      id: asNodeId('n1'),
      type: SYSTEM_IDS.NODE_TYPE,
      properties: {},
    });

    graph = unwrap(
      addNode(graph, sourceNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;

    const result = createEdgeAction(graph, {
      source: asNodeId('n1'),
      target: asNodeId('n2'), // n2 is not in the graph
      type: asTypeId('test-edge'),
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/Target node n2 not found/);
    }
  });
});
