import { describe, it, expect } from 'vitest';
import {
  isTextValue,
  isNumberValue,
  isNode,
  isEdge
} from '../src/guards';
import type { TextValue, NumberValue } from '@canopy/types';

describe('Type Guards', () => {
  it('should identify TextValue', () => {
    const val: TextValue = { kind: 'text', value: 'hello' };
    expect(isTextValue(val)).toBe(true);
    expect(isNumberValue(val)).toBe(false);
  });

  it('should identify NumberValue', () => {
    const val: NumberValue = { kind: 'number', value: 123 };
    expect(isNumberValue(val)).toBe(true);
    expect(isTextValue(val)).toBe(false);
  });

  it('should identify Node', () => {
    const node: unknown = {
      id: '123',
      type: 'T',
      properties: new Map(),
      metadata: {}
    };
    expect(isNode(node)).toBe(true);
    expect(isEdge(node)).toBe(false);
  });
});
