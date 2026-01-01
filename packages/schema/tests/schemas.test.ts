import { describe, it, expect } from 'vitest';
import {
  NodeSchema,
  GraphSchema,
  InstantSchema,
  PlainDateSchema,
  PropertyValueSchema
} from '../src/schemas';
import type { NodeId } from '@canopy/types';

describe('Zod Schemas', () => {
  it('should validate Instant', () => {
    const iso = '2023-10-27T10:00:00.000Z';
    expect(InstantSchema.parse(iso)).toBe(iso);
    expect(() => InstantSchema.parse('invalid')).toThrow();
  });

  it('should validate PlainDate', () => {
    expect(PlainDateSchema.parse('2023-10-27')).toBe('2023-10-27');
    expect(() => PlainDateSchema.parse('2023/10/27')).toThrow();
  });

  it('should validate PropertyValue (Text)', () => {
    const val = { kind: 'text', value: 'hello' };
    expect(PropertyValueSchema.parse(val)).toEqual(val);
  });

  it('should validate PropertyValue (List)', () => {
    const val = {
      kind: 'list',
      items: [
        { kind: 'text', value: 'a' },
        { kind: 'text', value: 'b' }
      ]
    };
    expect(PropertyValueSchema.parse(val)).toEqual(val);
  });

  it('should validate Node', () => {
    const nodeData = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'Person',
      properties: new Map(),
      metadata: {
        created: '2023-10-27T10:00:00.000Z',
        modified: '2023-10-27T10:00:00.000Z'
      }
    };

    const parsed = NodeSchema.parse(nodeData);
    expect(parsed.id).toBe(nodeData.id);
    expect(parsed.properties).toBeInstanceOf(Map);
  });

  it('should validate Node from JSON object', () => {
    const jsonNode = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'Person',
      properties: {
        "name": { "kind": "text", "value": "Alice" },
        "age": { "kind": "number", "value": 30 }
      },
      metadata: {
        created: '2023-10-27T10:00:00.000Z',
        modified: '2023-10-27T10:00:00.000Z'
      }
    };

    const parsed = NodeSchema.parse(jsonNode);
    expect(parsed.properties).toBeInstanceOf(Map);
    expect(parsed.properties.get("name")).toEqual({ kind: "text", value: "Alice" });
  });

  it('should validate Graph from JSON object', () => {
    const jsonGraph = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Test Graph',
      metadata: {
        created: '2023-10-27T10:00:00.000Z',
        modified: '2023-10-27T10:00:00.000Z'
      },
      nodes: {
        '123e4567-e89b-12d3-a456-426614174000': {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type: 'Person',
          properties: {},
          metadata: {
            created: '2023-10-27T10:00:00.000Z',
            modified: '2023-10-27T10:00:00.000Z'
          }
        }
      },
      edges: {}
    };

    const parsed = GraphSchema.parse(jsonGraph);
    expect(parsed.nodes).toBeInstanceOf(Map);
    expect(parsed.nodes.size).toBe(1);
    // Cast key to string to avoid branded type issue in test
    expect(parsed.nodes.get('123e4567-e89b-12d3-a456-426614174000' as unknown as NodeId)?.type).toBe('Person');
  });
});
