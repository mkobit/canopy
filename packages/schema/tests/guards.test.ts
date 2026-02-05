import { describe, it, expect } from 'bun:test';
import { isTextValue, isNumberValue, isNode, isEdge } from '../src/guards';

describe('Type Guards', () => {
  it('should identify TextValue', () => {
    const value = 'hello';
    expect(isTextValue(value)).toBe(true);
    expect(isNumberValue(value)).toBe(false);
  });

  it('should identify NumberValue', () => {
    const value = 123;
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
