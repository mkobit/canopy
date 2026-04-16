import { describe, it, expect } from 'bun:test';
import type { ScalarValue, PropertyValue } from '@canopy/types';
import {
  isTextValue,
  isNumberValue,
  isBooleanValue,
  isInstantValue,
  isPlainDateValue,
  isReferenceValue,
  isExternalReferenceValue,
  isListValue,
  isScalarValue,
  isNode,
  isEdge,
} from '../src/guards';

describe('Type Guards', () => {
  it('should identify TextValue', () => {
    const value = 'hello';
    expect(isTextValue(value)).toBe(true);
    expect(isNumberValue(value as unknown as ScalarValue)).toBe(false);
  });

  it('should identify NumberValue', () => {
    const value = 123;
    expect(isNumberValue(value)).toBe(true);
    expect(isTextValue(value as unknown as ScalarValue)).toBe(false);
  });

  it('should identify BooleanValue', () => {
    const value = true;
    expect(isBooleanValue(value)).toBe(true);
    expect(isTextValue(value as unknown as ScalarValue)).toBe(false);
  });

  it('should identify InstantValue', () => {
    const value = '2023-01-01T00:00:00Z';
    expect(isInstantValue(value)).toBe(true);
    expect(isNumberValue(value as unknown as ScalarValue)).toBe(false);
  });

  it('should identify PlainDateValue', () => {
    const value = '2023-01-01';
    expect(isPlainDateValue(value)).toBe(true);
    expect(isNumberValue(value as unknown as ScalarValue)).toBe(false);
  });

  it('should identify ReferenceValue', () => {
    const value = '018b1a2b-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
    expect(isReferenceValue(value)).toBe(true);
    expect(isNumberValue(value as unknown as ScalarValue)).toBe(false);
  });

  it('should identify ExternalReferenceValue', () => {
    const value = { graph: 'g1', target: 't1' };
    expect(isExternalReferenceValue(value)).toBe(true);
    expect(isExternalReferenceValue('not an object' as unknown as ScalarValue)).toBe(false);
    expect(isExternalReferenceValue(null as unknown as ScalarValue)).toBe(false);
    expect(isExternalReferenceValue({ graph: 'g1' } as unknown as ScalarValue)).toBe(false);
  });

  it('should identify ListValue', () => {
    const value = ['a', 'b'];
    expect(isListValue(value)).toBe(true);
    expect(isScalarValue(value)).toBe(false);
  });

  it('should identify ScalarValue', () => {
    const value = 'a';
    expect(isScalarValue(value)).toBe(true);
    expect(isListValue(value as unknown as PropertyValue)).toBe(false);
  });

  it('should identify Node', () => {
    const node: unknown = {
      id: '123',
      type: 'T',
      properties: new Map(),
      metadata: {},
    };
    expect(isNode(node)).toBe(true);
    expect(isEdge(node)).toBe(false);
  });

  it('should identify Edge', () => {
    const edge: unknown = {
      id: 'e1',
      type: 'E',
      source: 'n1',
      target: 'n2',
      properties: new Map(),
      metadata: {},
    };
    expect(isEdge(edge)).toBe(true);
    expect(isNode(edge)).toBe(false);
  });
});
