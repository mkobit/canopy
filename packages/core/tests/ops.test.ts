import { describe, it, expect } from 'bun:test';
import { createGraph } from '../src/graph';
import { addNode, updateNode } from '../src/ops/index';
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
  g = unwrap(addNode(g, personTypeNode)).graph;
  return g;
}

describe('ops with validation', () => {
  it('addNode returns Error if validation fails and validation is enabled', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: {}, // missing age
    });

    const result = addNode(g, node, { validate: true });
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

    const result = addNode(g, node);
    expect(isOk(result)).toBe(true);
  });

  it('addNode succeeds if validation passes', () => {
    const g = createGraphWithTypes();
    const node = createNode({
      type: asTypeId('type-person'),
      properties: { age: 20 },
    });

    const result = addNode(g, node, { validate: true });
    expect(isOk(result)).toBe(true);
  });

  it('updateNode returns Error if validation fails', () => {
    let g = createGraphWithTypes();
    const node = createNode({
      id: asNodeId('p1'),
      type: asTypeId('type-person'),
      properties: { age: 20 },
    });
    g = unwrap(addNode(g, node)).graph;

    const result = updateNode(
      g,
      node.id,
      (n) => ({
        ...n,
        properties: new Map(), // remove age
      }),
      { validate: true },
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toMatch(/Node validation failed/);
    }
  });
});
