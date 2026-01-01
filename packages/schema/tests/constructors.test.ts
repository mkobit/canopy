import { describe, it, expect } from 'vitest';
import {
  createNodeId,
  createTypeId,
  createInstant,
  createPlainDate
} from '../src/constructors';

describe('Constructors', () => {
  it('should create valid NodeId from valid UUID', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const nodeId = createNodeId(validUuid);
    expect(nodeId).toBe(validUuid);
  });

  it('should throw error for invalid NodeId', () => {
    expect(() => createNodeId('invalid-uuid')).toThrow();
  });

  it('should generate new NodeId if no argument', () => {
    const nodeId = createNodeId();
    expect(nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should create valid TypeId', () => {
    expect(createTypeId('MyType')).toBe('MyType');
    expect(createTypeId('my-type_1')).toBe('my-type_1');
  });

  it('should throw for invalid TypeId', () => {
    expect(() => createTypeId('Invalid Type')).toThrow(); // Spaces not allowed in regex
    expect(() => createTypeId('')).toThrow();
  });

  it('should create valid Instant', () => {
    const iso = '2023-10-27T10:00:00.000Z';
    expect(createInstant(iso)).toBe(iso);
  });

  it('should throw for invalid Instant', () => {
    expect(() => createInstant('invalid-date')).toThrow();
  });

  it('should create valid PlainDate', () => {
    expect(createPlainDate('2023-10-27')).toBe('2023-10-27');
  });

  it('should throw for invalid PlainDate', () => {
    expect(() => createPlainDate('2023/10/27')).toThrow();
    expect(() => createPlainDate('2023-02-30')).toThrow(); // Invalid date check
  });
});
