import { describe, it, expect } from 'vitest';
import {
  NodeSchema,
  EdgeSchema,
  NodeTypeDefinitionSchema
} from '../src/index.js';
import {
  createNodeId,
  createEdgeId,
  createInstant,
  asTypeId
} from '@canopy/types';

describe('Schema Validation', () => {
  it('should validate a valid Node', () => {
    const validNode = {
      id: createNodeId(),
      type: asTypeId('Person'),
      properties: new Map([
        ['name', { kind: 'text', value: 'Alice' }],
        ['age', { kind: 'number', value: 30 }]
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
      }
    };

    const result = NodeSchema.safeParse(validNode);
    expect(result.success).toBe(true);
  });

  it('should validate a valid Edge', () => {
    const validEdge = {
      id: createEdgeId(),
      source: createNodeId(),
      target: createNodeId(),
      type: asTypeId('ATTENDED'),
      properties: new Map([
        ['date', { kind: 'instant', value: createInstant() }]
      ]),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
      }
    };

    const result = EdgeSchema.safeParse(validEdge);
    expect(result.success).toBe(true);
  });

  it('should validate a valid NodeTypeDefinition', () => {
    const validDefinition = {
      id: asTypeId('NodeType'),
      name: 'Node Type',
      description: 'A type of node',
      properties: [
        { name: 'name', valueKind: 'text', required: true, description: 'The name' }
      ],
      validOutgoingEdges: [asTypeId('KNOWS')],
      validIncomingEdges: [],
    };

    const result = NodeTypeDefinitionSchema.safeParse(validDefinition);
    expect(result.success).toBe(true);
  });
});
