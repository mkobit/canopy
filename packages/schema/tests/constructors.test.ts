import { describe, it, expect } from 'vitest';
import { createNodeId, createTypeId, createInstant, createPlainDate } from '../src/constructors';
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
    expect(nodeId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('should create valid TypeId', () => {
    expect(unwrap(createTypeId('MyType'))).toBe('MyType');
    expect(unwrap(createTypeId('my-type_1'))).toBe('my-type_1');
  });

  it('should return Error for invalid TypeId', () => {
    expect(isErr(createTypeId('Invalid Type'))).toBe(true); // Spaces not allowed in regex
    expect(isErr(createTypeId(''))).toBe(true);
  });

  it('should create valid Instant', () => {
    const iso = '2023-10-27T10:00:00.000Z';
    expect(unwrap(createInstant(iso))).toBe(iso);
  });

  it('should return Error for invalid Instant', () => {
    expect(isErr(createInstant('invalid-date'))).toBe(true);
  });

  it('should create valid PlainDate', () => {
    expect(unwrap(createPlainDate('2023-10-27'))).toBe('2023-10-27');
  });

  it('should return Error for invalid PlainDate', () => {
    expect(isErr(createPlainDate('2023/10/27'))).toBe(true);
    expect(isErr(createPlainDate('2023-02-30'))).toBe(true); // Invalid date check
  });
});
