import { describe, it, expect } from 'bun:test';
import { validateNode } from './validation';
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
import type { PropertyDefinition, PropertyValue } from './index';

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

function createGraphWithCustomType(propDef: PropertyDefinition) {
  let g = unwrap(createGraph(createGraphId(), 'Test Graph'));

  const typeNode = createNode({
    id: asNodeId('type-test'),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: {
      name: 'TestType',
      properties: JSON.stringify([propDef]),
    },
  });

  g = unwrap(
    addNode(g, typeNode, { deviceId: asDeviceId('00000000-0000-0000-0000-000000000000') }),
  ).graph;

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
      expect(result.errors[0].message).toContain('must be one of the allowed choices');
      expect(result.errors[0].path).toEqual(['color']);
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
      expect(result.errors[0].message).toContain('must be one of the allowed choices');
      expect(result.errors[0].path).toEqual(['colors', '1']);
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
      expect(result.errors[0].message).toContain('does not match the required pattern');
      expect(result.errors[0].path).toEqual(['code']);
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
      expect(result.errors[0].message).toContain('does not match the required pattern');
      expect(result.errors[0].path).toEqual(['codes', '1']);
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
      expect(result.errors[0].message).toContain('invalid regular expression constraint');
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
      expect(result.errors[0].message).toContain('must be at least 10');
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
      expect(result.errors[0].message).toContain('must be at least 3 characters long');
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
      expect(result.errors[0].message).toContain('must contain at least 2 items');
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
      expect(result.errors[0].message).toContain('must be at most 10');
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
      expect(result.errors[0].message).toContain('must be at most 3 characters long');
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
      expect(result.errors[0].message).toContain('must contain at most 2 items');
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
      expect(result.errors[0].message).toContain('too long for pattern validation');
      expect(result.errors[0].path).toEqual(['code']);
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
      expect(result.errors[0].message).toContain('too long for pattern validation');
      expect(result.errors[0].path).toEqual(['codes', '0']);
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
      expect(result.errors[0].message).toContain("expected type 'text' but got incompatible value");
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
      expect(result.errors[0].message).toContain("expected type 'text' but got incompatible value");
    });
  });
});
