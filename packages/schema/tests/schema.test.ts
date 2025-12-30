import { describe, it, expect } from 'vitest';
import { NodeSchema, EdgeSchema, NodeTypeSchema, PropertyDefinitionSchema } from '../src';
import { v4 as uuidv4 } from 'uuid';

// Mock uuid for consistency if needed, but uuidv4 is fine
const validUuid = '502f6a9c-0c33-40f4-9029-7c15273d2218';
const now = new Date().toISOString();

describe('NodeSchema', () => {
  it('validates a valid node', () => {
    const validNode = {
      id: validUuid,
      type: 'Person',
      properties: { name: 'Alice', age: 30 },
      created: now,
      modified: now,
    };
    expect(NodeSchema.parse(validNode)).toEqual(validNode);
  });

  it('fails on invalid node', () => {
    const invalidNode = {
      id: 'not-uuid',
      type: 'Person',
      properties: {},
      created: now,
      modified: now,
    };
    expect(() => NodeSchema.parse(invalidNode)).toThrow();
  });
});

describe('EdgeSchema', () => {
  it('validates a valid edge', () => {
    const validEdge = {
      id: validUuid,
      source: uuidv4(),
      target: uuidv4(),
      type: 'ATTENDED',
      properties: { role: 'Speaker' },
      created: now,
      modified: now,
    };
    expect(EdgeSchema.parse(validEdge)).toEqual(validEdge);
  });
});

describe('NodeTypeSchema', () => {
  it('validates a valid node type definition', () => {
    const validNodeType = {
      id: validUuid,
      type: 'NodeType',
      properties: {
        name: 'Person',
        properties: [
          { name: 'name', type: 'string', required: true },
          { name: 'age', type: 'number' },
        ],
      },
      created: now,
      modified: now,
    };
    expect(NodeTypeSchema.parse(validNodeType)).toEqual(validNodeType);
  });
});
