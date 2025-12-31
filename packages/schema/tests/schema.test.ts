import { describe, it, expect } from 'vitest';
import { NodeSchema, EdgeSchema, NodeTypeDefinitionSchema } from '../src';
import { v4 as uuidv4 } from 'uuid';
import { asNodeId, asTypeId, asTimestamp, asEdgeId } from '@canopy/types';

// Mock uuid for consistency if needed, but uuidv4 is fine
const validUuid = '502f6a9c-0c33-40f4-9029-7c15273d2218';
const now = new Date().toISOString();

describe('NodeSchema', () => {
  it('validates a valid node', () => {
    const validNode = {
      id: asNodeId(validUuid),
      type: asTypeId('Person'),
      properties: new Map([
          ['name', { kind: 'text', value: 'Alice' }],
          ['age', { kind: 'number', value: 30 }]
      ]),
      metadata: {
        created: asTimestamp(now),
        modified: asTimestamp(now),
      }
    };
    // Zod map handling requires map input
    const result = NodeSchema.parse(validNode);
    expect(result.id).toBe(validNode.id);
    expect(result.type).toBe(validNode.type);
    expect(result.properties.get('name')).toEqual({ kind: 'text', value: 'Alice' });
  });

  it('fails on invalid node', () => {
    const invalidNode = {
      id: 'not-uuid',
      type: 'Person',
      properties: {},
      created: now,
      modified: now,
    };
    // Schema expects map, so object will fail
    expect(() => NodeSchema.parse(invalidNode)).toThrow();
  });
});

describe('EdgeSchema', () => {
  it('validates a valid edge', () => {
    const validEdge = {
      id: asEdgeId(validUuid),
      source: asNodeId(uuidv4()),
      target: asNodeId(uuidv4()),
      type: asTypeId('ATTENDED'),
      properties: new Map([
          ['role', { kind: 'text', value: 'Speaker' }]
      ]),
      metadata: {
        created: asTimestamp(now),
        modified: asTimestamp(now),
      }
    };
    const result = EdgeSchema.parse(validEdge);
    expect(result.id).toBe(validEdge.id);
  });
});

describe('NodeTypeDefinitionSchema', () => {
  it('validates a valid node type definition', () => {
    const validNodeType = {
      id: asTypeId('NodeType'),
      name: 'Person',
      properties: [
          { name: 'name', valueKind: 'text', required: true },
          { name: 'age', valueKind: 'number', required: false },
      ],
      validOutgoingEdges: [],
      validIncomingEdges: []
    };
    // Note: NodeTypeDefinitionSchema is NOT a Node (which is a graph instance),
    // it is the structure of the DEFINITION inside a NodeType node or standalone.
    // The previous test was confusing "Node of type NodeType" with "NodeTypeDefinition".

    // In @canopy/schema/src/index.ts:
    // export const NodeTypeDefinitionSchema = z.object({ ... });

    expect(NodeTypeDefinitionSchema.parse(validNodeType)).toEqual(validNodeType);
  });
});
