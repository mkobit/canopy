import { describe, it, expect } from 'vitest';
import { NodeSchema } from '../src';

describe('NodeSchema', () => {
  it('validates a valid node', () => {
    const validNode = {
      id: '502f6a9c-0c33-40f4-9029-7c15273d2218',
      labels: ['Person'],
      properties: { name: 'Alice' }
    };
    expect(NodeSchema.parse(validNode)).toEqual(validNode);
  });

  it('fails on invalid node', () => {
    const invalidNode = {
      id: 'not-uuid',
      labels: ['Person'],
      properties: {}
    };
    expect(() => NodeSchema.parse(invalidNode)).toThrow();
  });
});
