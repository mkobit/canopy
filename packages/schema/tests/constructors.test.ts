import { describe, it, expect } from 'vitest';
import { createNodeId, createTypeId, createInstant } from '../src/constructors';
import { unwrap, isErr } from '@canopy/types';

describe('Constructors', () => {
  it('should create valid NodeId from valid UUID', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';
    const nodeId = unwrap(createNodeId(validUuid));
    expect(nodeId).toBe(validUuid);
  });

  it('should return Error for invalid NodeId', () => {
    expect(isErr(createNodeId('invalid-uuid'))).toBe(true);
  });

  it('should generate new NodeId if no argument', () => {
    const nodeId = unwrap(createNodeId());
    expect(nodeId).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
  });

  it('should create valid TypeId', () => {
    expect(unwrap(createTypeId('MyType'))).toBe('MyType');
    expect(unwrap(createTypeId('my-type_1'))).toBe('my-type_1');
  });

  it('should return Error for invalid TypeId', () => {
    expect(isErr(createTypeId('Invalid Type'))).toBe(true); // Spaces not allowed in regex
    expect(isErr(createTypeId(''))).toBe(true);
  });

  it('should create valid Instant from string', () => {
    const iso = '2023-10-27T10:00:00.000Z';
    const expected = 1698400800000;
    expect(unwrap(createInstant(iso))).toBe(expected);
  });

  it('should create valid Instant from number', () => {
    const timestamp = 1698400800000;
    expect(unwrap(createInstant(timestamp))).toBe(timestamp);
  });

  it('should return Error for invalid Instant', () => {
    expect(isErr(createInstant('invalid-date'))).toBe(true);
  });
});
