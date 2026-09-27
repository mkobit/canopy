import { describe, expect, it } from 'bun:test';
import { createGraphAccessError } from '@canopy/graph-access';
import { toWitError } from '../src/result-errors';

describe('WIT result errors', () => {
  it('translates graph access errors to the existing WIT target', () => {
    const error = createGraphAccessError('CONCURRENCY_CONFLICT', 'Sequence mismatch');
    expect(toWitError(error)).toEqual({
      code: 'ConcurrencyConflict',
      message: 'Sequence mismatch',
    });
  });
});
