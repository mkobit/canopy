import { describe, it, expect } from 'bun:test';
import { validateNode, validatePropertyByType } from './validation';
import { createGraph } from './create-graph';
import { addNode } from './ops';
import { SYSTEM_IDS } from './system';
import {
  asNodeId,
  asTypeId,
  createNodeId,
  createGraphId,
  createInstant,
  unwrap,
  asDeviceId,
  PropertyDefinitionSchema,
} from './index';
import type { PropertyDefinition, PropertyValue, Node } from './index';

function createNode(properties: Record<string, unknown>): Node {
  return {
    id: createNodeId(),
    type: asTypeId('test'),
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

function createGraphWithCustomType(
  propertyDefinition: PropertyDefinition,
  extraNodes: readonly Node[] = [],
) {
  let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

  const typeNode = createNode({
    id: asNodeId('type-test'),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: {
      name: 'TestType',
      properties: JSON.stringify([propertyDefinition]),
    },
  });

  g = unwrap(
    addNode(g, typeNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
  ).graph;

  for (const extraNode of extraNodes) {
    g = unwrap(
      addNode(g, extraNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
    ).graph;
  }

  return g;
}

describe('validation constraints', () => {
  describe('choices constraint', () => {
    it('passes when string matches one of the choices', () => {
      const g = createGraphWithCustomType({
        name: 'color',
        valueKind: 'text',
        required: true,
        description: undefined,
        choices: ['red', 'green', 'blue'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { color: 'green' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('fails when string is not in choices', () => {
      const g = createGraphWithCustomType({
        name: 'color',
        valueKind: 'text',
        required: true,
        description: undefined,
        choices: ['red', 'green', 'blue'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { color: 'yellow' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be one of the allowed choices');
      expect(firstError.path).toEqual(['color']);
    });

    it('passes for list when all elements match choices', () => {
      const g = createGraphWithCustomType({
        name: 'colors',
        valueKind: 'list',
        required: true,
        description: undefined,
        choices: ['red', 'green', 'blue'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { colors: ['red', 'blue'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('fails for list when one element is not in choices', () => {
      const g = createGraphWithCustomType({
        name: 'colors',
        valueKind: 'list',
        required: true,
        description: undefined,
        choices: ['red', 'green', 'blue'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { colors: ['red', 'yellow', 'blue'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be one of the allowed choices');
      expect(firstError.path).toEqual(['colors', '1']);
    });
  });

  describe('regex constraint', () => {
    it('passes when string matches regex pattern', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: true,
        description: undefined,
        regex: String.raw`^A-\d+$`,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: 'A-123' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('fails when string does not match regex pattern', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: true,
        description: undefined,
        regex: String.raw`^A-\d+$`,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: 'B-123' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('does not match the required pattern');
      expect(firstError.path).toEqual(['code']);
    });

    it('passes for list when all elements match regex pattern', () => {
      const g = createGraphWithCustomType({
        name: 'codes',
        valueKind: 'list',
        required: true,
        description: undefined,
        regex: String.raw`^A-\d+$`,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { codes: ['A-1', 'A-2'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('fails for list when one element does not match regex pattern', () => {
      const g = createGraphWithCustomType({
        name: 'codes',
        valueKind: 'list',
        required: true,
        description: undefined,
        regex: String.raw`^A-\d+$`,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { codes: ['A-1', 'B-2'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('does not match the required pattern');
      expect(firstError.path).toEqual(['codes', '1']);
    });

    it('fails gracefully when regex pattern is invalid', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: true,
        description: undefined,
        regex: '[invalid-regex',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: 'A-123' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('invalid regular expression constraint');
    });
  });

  describe('min constraint', () => {
    it('passes when number is >= min', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'number',
        required: true,
        description: undefined,
        min: 10,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 10 },
      });
      expect(validateNode(g, node).valid).toBe(true);
    });

    it('fails when number is < min', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'number',
        required: true,
        description: undefined,
        min: 10,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 9 },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be at least 10');
    });

    it('passes when string length is >= min', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'text',
        required: true,
        description: undefined,
        min: 3,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 'abc' },
      });
      expect(validateNode(g, node).valid).toBe(true);
    });

    it('fails when string length is < min', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'text',
        required: true,
        description: undefined,
        min: 3,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 'ab' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be at least 3 characters long');
    });

    it('passes when list length is >= min', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'list',
        required: true,
        description: undefined,
        min: 2,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: ['a', 'b'] },
      });
      expect(validateNode(g, node).valid).toBe(true);
    });

    it('fails when list length is < min', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'list',
        required: true,
        description: undefined,
        min: 2,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: ['a'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must contain at least 2 items');
    });
  });

  describe('max constraint', () => {
    it('passes when number is <= max', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'number',
        required: true,
        description: undefined,
        max: 10,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 10 },
      });
      expect(validateNode(g, node).valid).toBe(true);
    });

    it('fails when number is > max', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'number',
        required: true,
        description: undefined,
        max: 10,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 11 },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be at most 10');
    });

    it('passes when string length is <= max', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'text',
        required: true,
        description: undefined,
        max: 3,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 'abc' },
      });
      expect(validateNode(g, node).valid).toBe(true);
    });

    it('fails when string length is > max', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'text',
        required: true,
        description: undefined,
        max: 3,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: 'abcd' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be at most 3 characters long');
    });

    it('passes when list length is <= max', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'list',
        required: true,
        description: undefined,
        max: 2,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: ['a', 'b'] },
      });
      expect(validateNode(g, node).valid).toBe(true);
    });

    it('fails when list length is > max', () => {
      const g = createGraphWithCustomType({
        name: 'val',
        valueKind: 'list',
        required: true,
        description: undefined,
        max: 2,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { val: ['a', 'b', 'c'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must contain at most 2 items');
    });
  });

  describe('ReDoS mitigation', () => {
    it('passes when string length is <= 8192 characters', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: true,
        description: undefined,
        regex: '^A+$',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: 'A'.repeat(8192) },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('fails when string length exceeds 8192 characters', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: true,
        description: undefined,
        regex: '^A+$',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: 'A'.repeat(8193) },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('too long for pattern validation');
      expect(firstError.path).toEqual(['code']);
    });

    it('fails when list element string exceeds 8192 characters', () => {
      const g = createGraphWithCustomType({
        name: 'codes',
        valueKind: 'list',
        required: true,
        description: undefined,
        regex: '^A+$',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { codes: ['A'.repeat(8193)] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('too long for pattern validation');
      expect(firstError.path).toEqual(['codes', '0']);
    });
  });

  describe('strict constraint schemas', () => {
    it('rejects null values in property definition schemas', () => {
      const raw = {
        name: 'code',
        valueKind: 'text',
        required: true,
        regex: null,
      };
      const result = PropertyDefinitionSchema.safeParse(raw);
      expect(result.success).toBe(false);
    });
  });

  describe('nullable constraint', () => {
    it('allows null value when nullable is true', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: false,
        description: undefined,
        nullable: true,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: null },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('rejects null value when nullable is false', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: false,
        description: undefined,
        nullable: false,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: null },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain("expected type 'text' but got incompatible value");
    });

    it('rejects null value when nullable is undefined', () => {
      const g = createGraphWithCustomType({
        name: 'code',
        valueKind: 'text',
        required: false,
        description: undefined,
        nullable: undefined,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { code: null },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain("expected type 'text' but got incompatible value");
    });
  });

  describe('cardinality constraint', () => {
    it('allows scalar value when cardinality is one', () => {
      const g = createGraphWithCustomType({
        name: 'tag',
        valueKind: 'text',
        required: true,
        description: undefined,
        cardinality: 'one',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { tag: 'urgent' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('rejects list value when cardinality is one', () => {
      const g = createGraphWithCustomType({
        name: 'tag',
        valueKind: 'text',
        required: true,
        description: undefined,
        cardinality: 'one',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { tag: ['urgent', 'bug'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain("expected cardinality 'one' but got list value");
    });

    it('allows array value when cardinality is many', () => {
      const g = createGraphWithCustomType({
        name: 'tags',
        valueKind: 'text',
        required: true,
        description: undefined,
        cardinality: 'many',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { tags: ['urgent', 'bug'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('rejects scalar value when cardinality is many', () => {
      const g = createGraphWithCustomType({
        name: 'tags',
        valueKind: 'text',
        required: true,
        description: undefined,
        cardinality: 'many',
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { tags: 'urgent' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain("expected cardinality 'many' but got scalar value");
    });
  });

  describe('closed-values enum choices constraint', () => {
    it('accepts value matching allowed choices', () => {
      const g = createGraphWithCustomType({
        name: 'status',
        valueKind: 'text',
        required: true,
        description: undefined,
        choices: ['draft', 'published', 'archived'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { status: 'published' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('rejects value not in allowed choices', () => {
      const g = createGraphWithCustomType({
        name: 'status',
        valueKind: 'text',
        required: true,
        description: undefined,
        choices: ['draft', 'published', 'archived'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { status: 'deleted' },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain('must be one of the allowed choices');
      expect(firstError.expected).toBe('draft, published, archived');
    });

    it('validates array elements against choices when cardinality is many', () => {
      const g = createGraphWithCustomType({
        name: 'labels',
        valueKind: 'text',
        required: true,
        description: undefined,
        cardinality: 'many',
        choices: ['frontend', 'backend', 'docs'],
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { labels: ['frontend', 'invalid-label'] },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.path).toEqual(['labels', '1']);
      expect(firstError.message).toContain('element at index 1 must be one of the allowed choices');
    });
  });

  describe('typed-reference targetTypeId constraint', () => {
    it('accepts reference targeting a node of matching targetTypeId', () => {
      const targetType = asTypeId('node:type:book');
      const targetNode = createNode({
        id: asNodeId('book-1'),
        type: targetType,
        properties: { title: 'Dune' },
      });
      const g = createGraphWithCustomType(
        {
          name: 'bookRef',
          valueKind: 'reference',
          required: true,
          description: undefined,
          targetTypeId: targetType,
        },
        [targetNode],
      );
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { bookRef: asNodeId('book-1') },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(true);
    });

    it('rejects reference targeting a node of mismatched type', () => {
      const targetType = asTypeId('node:type:book');
      const wrongType = asTypeId('node:type:movie');
      const targetNode = createNode({
        id: asNodeId('movie-1'),
        type: wrongType,
        properties: { title: 'Inception' },
      });
      const g = createGraphWithCustomType(
        {
          name: 'bookRef',
          valueKind: 'reference',
          required: true,
          description: undefined,
          targetTypeId: targetType,
        },
        [targetNode],
      );
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { bookRef: asNodeId('movie-1') },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain("has type 'node:type:movie', expected 'node:type:book'");
    });

    it('rejects reference targeting a non-existent node', () => {
      const targetType = asTypeId('node:type:book');
      const g = createGraphWithCustomType({
        name: 'bookRef',
        valueKind: 'reference',
        required: true,
        description: undefined,
        targetTypeId: targetType,
      });
      const node = createNode({
        type: asTypeId('type-test'),
        properties: { bookRef: asNodeId('missing-book') },
      });
      const result = validateNode(g, node);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      const [firstError] = result.errors;
      if (firstError === undefined) throw new Error('Expected error');
      expect(firstError.message).toContain("target node 'missing-book' not found in graph");
    });
  });

  describe('validatePropertyByType with constraints', () => {
    it('extracts and enforces cardinality, choices, and targetTypeId from PropertyType node', () => {
      const targetType = asTypeId('node:type:author');
      const authorNode = createNode({
        id: asNodeId('author-1'),
        type: targetType,
        properties: { name: 'Asimov' },
      });

      const propertyTypeNode = createNode({
        id: asNodeId('prop-author'),
        type: SYSTEM_IDS.PROPERTY_TYPE,
        properties: {
          name: 'author',
          valueKind: 'reference',
          cardinality: 'one',
          targetTypeId: targetType,
        },
      });

      let graph = unwrap(createGraph(createGraphId(), 'Test Graph'));
      graph = unwrap(
        addNode(graph, authorNode, {
          deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
        }),
      ).graph;
      graph = unwrap(
        addNode(graph, propertyTypeNode, {
          deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
        }),
      ).graph;

      const validResult = validatePropertyByType(graph, propertyTypeNode.id, asNodeId('author-1'));
      expect(validResult.valid).toBe(true);

      const invalidResult = validatePropertyByType(graph, propertyTypeNode.id, [
        asNodeId('author-1'),
      ]);
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors[0]?.message).toContain("expected cardinality 'one'");
    });
  });
});
