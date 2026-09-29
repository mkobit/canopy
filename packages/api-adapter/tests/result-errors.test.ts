import { describe, expect, it } from 'bun:test';
import { createGraphAccessError, type GraphAccessErrorCategory } from '@canopy/graph-access';
import { GrpcStatusCode, toGraphQLExtensions, toGrpcStatus } from '../src/result-errors';

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

  it('preserves exact GraphQL and gRPC payloads for every graph-access category', () => {
    const mappings: readonly Readonly<{
      readonly category: GraphAccessErrorCategory;
      readonly grpcCode: GrpcStatusCode;
    }>[] = [
      { category: 'VALIDATION_ERROR', grpcCode: GrpcStatusCode.INVALID_ARGUMENT },
      { category: 'NOT_FOUND', grpcCode: GrpcStatusCode.NOT_FOUND },
      { category: 'CONCURRENCY_CONFLICT', grpcCode: GrpcStatusCode.ABORTED },
      { category: 'UNAUTHORIZED', grpcCode: GrpcStatusCode.PERMISSION_DENIED },
      { category: 'FORBIDDEN', grpcCode: GrpcStatusCode.PERMISSION_DENIED },
      { category: 'RESOURCE_EXHAUSTED', grpcCode: GrpcStatusCode.RESOURCE_EXHAUSTED },
      { category: 'INTERNAL_ERROR', grpcCode: GrpcStatusCode.INTERNAL },
    ];

    for (const { category, grpcCode } of mappings) {
      const message = `Protocol error for ${category}`;
      const details = { category, retryable: false };
      const error = createGraphAccessError(category, message, details);

      expect(toGrpcStatus(error)).toEqual({ code: grpcCode, message, details });
      expect(toGraphQLExtensions(error)).toEqual({
        code: category,
        category,
        details,
      });
    }
  });
});
