import { describe, expect, it } from 'bun:test';
import { err, isErr, isOk, ok } from '@canopy/graph';
import {
  inferCategoryFromError,
  mapKernelResultToGraphAccessResult,
  toGraphAccessError,
} from '../src/result-errors';

describe('ResultErrorUtilities', () => {
  it('should infer error categories from standard error messages', () => {
    expect(inferCategoryFromError(new Error('Entity not found'))).toBe('NOT_FOUND');
    expect(inferCategoryFromError(new Error('Schema validation failed'))).toBe('VALIDATION_ERROR');
    expect(inferCategoryFromError(new Error('CAS sequence conflict'))).toBe('CONCURRENCY_CONFLICT');
    expect(inferCategoryFromError(new Error('Unauthorized token'))).toBe('UNAUTHORIZED');
    expect(inferCategoryFromError(new Error('Permission denied'))).toBe('FORBIDDEN');
    expect(inferCategoryFromError(new Error('Max query depth exceeded'))).toBe(
      'RESOURCE_EXHAUSTED',
    );
    expect(inferCategoryFromError(new Error('Unexpected disk read crash'))).toBe('INTERNAL_ERROR');
  });

  it('should map kernel Result to graph access Result cleanly', () => {
    const successResult = mapKernelResultToGraphAccessResult(ok({ id: '123' }));
    expect(isOk(successResult)).toBe(true);

    const errorResult = mapKernelResultToGraphAccessResult(err(new Error('Node not found')));
    expect(isErr(errorResult)).toBe(true);
    if (isErr(errorResult)) {
      expect(errorResult.error.category).toBe('NOT_FOUND');
      expect(errorResult.error.message).toBe('Node not found');
    }
  });

  it('should convert unknown errors to GraphAccessError safely', () => {
    const adapted = toGraphAccessError('string error', 'VALIDATION_ERROR');
    expect(adapted.category).toBe('VALIDATION_ERROR');
    expect(adapted.message).toBe('string error');
  });
});
