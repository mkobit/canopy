import { describe, expect, it } from 'bun:test';
import { err, isErr, isOk, ok } from '@canopy/graph';
import {
  createApiAdapterError,
  inferCategoryFromError,
  mapKernelResultToApiResult,
  toApiAdapterError,
  toGraphQLExtensions,
  toGrpcStatus,
  toWitError,
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

  it('should map kernel Result to ApiAdapter Result cleanly', () => {
    const successResult = mapKernelResultToApiResult(ok({ id: '123' }));
    expect(isOk(successResult)).toBe(true);

    const errorResult = mapKernelResultToApiResult(err(new Error('Node not found')));
    expect(isErr(errorResult)).toBe(true);
    if (isErr(errorResult)) {
      expect(errorResult.error.category).toBe('NOT_FOUND');
      expect(errorResult.error.message).toBe('Node not found');
    }
  });

  it('should translate ApiAdapterError to gRPC, GraphQL, and WIT error targets', () => {
    const error = createApiAdapterError('CONCURRENCY_CONFLICT', 'Sequence mismatch', {
      expected: 5,
      actual: 4,
    });

    const grpcStatus = toGrpcStatus(error);
    expect(grpcStatus.code).toBe(10);
    expect(grpcStatus.message).toBe('Sequence mismatch');
    expect(grpcStatus.details).toEqual({ expected: 5, actual: 4 });

    const gqlExtensions = toGraphQLExtensions(error);
    expect(gqlExtensions.code).toBe('CONCURRENCY_CONFLICT');
    expect(gqlExtensions.category).toBe('CONCURRENCY_CONFLICT');
    expect(gqlExtensions.details).toEqual({ expected: 5, actual: 4 });

    const witError = toWitError(error);
    expect(witError.code).toBe('ConcurrencyConflict');
    expect(witError.message).toBe('Sequence mismatch');
  });

  it('should convert unknown errors to ApiAdapterError safely', () => {
    const adapted = toApiAdapterError('string error', 'VALIDATION_ERROR');
    expect(adapted.category).toBe('VALIDATION_ERROR');
    expect(adapted.message).toBe('string error');
  });
});
