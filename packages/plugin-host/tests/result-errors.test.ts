import { describe, expect, it } from 'bun:test';
import { createGraphAccessError, type GraphAccessErrorCategory } from '@canopy/graph-access';
import { toWitError, type WitErrorCode } from '../src/result-errors';

describe('WIT result errors', () => {
  it('translates graph access errors to the existing WIT target', () => {
    const error = createGraphAccessError('CONCURRENCY_CONFLICT', 'Sequence mismatch');
    expect(toWitError(error)).toEqual({
      code: 'ConcurrencyConflict',
      message: 'Sequence mismatch',
    });
  });

  it('preserves the exact WIT code for every graph access error category', () => {
    const expected: Readonly<Record<GraphAccessErrorCategory, WitErrorCode>> = {
      VALIDATION_ERROR: 'ValidationError',
      NOT_FOUND: 'NotFound',
      CONCURRENCY_CONFLICT: 'ConcurrencyConflict',
      UNAUTHORIZED: 'PermissionDenied',
      FORBIDDEN: 'PermissionDenied',
      RESOURCE_EXHAUSTED: 'ResourceExhausted',
      INTERNAL_ERROR: 'InternalError',
    };

    for (const [category, code] of Object.entries(expected) as readonly [
      GraphAccessErrorCategory,
      WitErrorCode,
    ][]) {
      expect(toWitError(createGraphAccessError(category, `message:${category}`))).toEqual({
        code,
        message: `message:${category}`,
      });
    }
  });
});
