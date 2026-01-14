import { describe, it, expect } from 'vitest';
import { isTextValue, isNumberValue, isNode, isEdge } from '../src/guards';
import type { TextValue, NumberValue } from '@canopy/types';

describe('Type Guards', () => {
  it('should identify TextValue', () => {
    const value: TextValue = { kind: 'text', value: 'hello' };
    expect(isTextValue(value)).toBe(true);
    expect(isNumberValue(value)).toBe(false);
  });

  it('should identify NumberValue', () => {
    const value: NumberValue = { kind: 'number', value: 123 };
    expect(isNumberValue(value)).toBe(true);
    expect(isTextValue(value)).toBe(false);
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
});
