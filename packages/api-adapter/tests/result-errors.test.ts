import { describe, expect, it } from 'bun:test';
import { createGraphAccessError } from '@canopy/graph-access';
import { toGraphQLExtensions, toGrpcStatus } from '../src/result-errors';

describe('Protocol result errors', () => {
  it('translates graph access errors to gRPC and GraphQL targets', () => {
    const error = createGraphAccessError('CONCURRENCY_CONFLICT', 'Sequence mismatch', {
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
  });
});
