import { describe, it, expect } from 'vitest';
import {
  NodeSchema,
  GraphSchema,
  InstantSchema,
  PropertyValueSchema,
} from '../src/schemas';
import type { NodeId } from '@canopy/types';

describe('Zod Schemas', () => {
  it('should validate Instant', () => {
    const timestamp = 1698400800000;
    expect(InstantSchema.parse(timestamp)).toBe(timestamp);
    expect(() => InstantSchema.parse('invalid')).toThrow();
  });

  it('should validate PropertyValue (Text)', () => {
    const value = 'hello';
    expect(PropertyValueSchema.parse(value)).toEqual(value);
  });

  it('should validate PropertyValue (List)', () => {
    const value = ['a', 'b'];
    expect(PropertyValueSchema.parse(value)).toEqual(value);
  });

  it('should validate Node', () => {
    const nodeData = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'Person',
      properties: new Map(),
      metadata: {
        created: 1698400800000,
        modified: 1698400800000,
      },
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
        name: 'Alice',
        age: 30,
      },
      metadata: {
        created: 1698400800000,
        modified: 1698400800000,
      },
    };

    const parsed = NodeSchema.parse(jsonNode);
    expect(parsed.properties).toBeInstanceOf(Map);
    expect(parsed.properties.get('name')).toBe('Alice');
  });

  it('should validate Graph from JSON object', () => {
    const jsonGraph = {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Test Graph',
      metadata: {
        created: 1698400800000,
        modified: 1698400800000,
      },
      nodes: {
        '123e4567-e89b-12d3-a456-426614174000': {
          id: '123e4567-e89b-12d3-a456-426614174000',
          type: 'Person',
          properties: {},
          metadata: {
            created: 1698400800000,
            modified: 1698400800000,
          },
        },
      },
      edges: {},
    };

    const parsed = GraphSchema.parse(jsonGraph);
    expect(parsed.nodes).toBeInstanceOf(Map);
    expect(parsed.nodes.size).toBe(1);
    // Cast key to string to avoid branded type issue in test
    expect(
      parsed.nodes.get('123e4567-e89b-12d3-a456-426614174000' as unknown as NodeId)?.type,
    ).toBe('Person');
  });
});
