import { describe, expect, it } from 'bun:test';
import {
  ConnectRpcError,
  GrpcStatusCode,
  createConnectErrorPayload,
  mapResultErrorToGrpcStatusCode,
} from '../src/connect/grpc-errors';
import { createApiAdapterError } from '../src/result-errors';

describe('gRPC status code and error mapper', () => {
  it('defines standard gRPC status codes matching specification', () => {
    expect(GrpcStatusCode.OK).toBe(0);
    expect(GrpcStatusCode.CANCELLED).toBe(1);
    expect(GrpcStatusCode.UNKNOWN).toBe(2);
    expect(GrpcStatusCode.INVALID_ARGUMENT).toBe(3);
    expect(GrpcStatusCode.DEADLINE_EXCEEDED).toBe(4);
    expect(GrpcStatusCode.NOT_FOUND).toBe(5);
    expect(GrpcStatusCode.ALREADY_EXISTS).toBe(6);
    expect(GrpcStatusCode.PERMISSION_DENIED).toBe(7);
    expect(GrpcStatusCode.RESOURCE_EXHAUSTED).toBe(8);
    expect(GrpcStatusCode.FAILED_PRECONDITION).toBe(9);
    expect(GrpcStatusCode.ABORTED).toBe(10);
    expect(GrpcStatusCode.OUT_OF_RANGE).toBe(11);
    expect(GrpcStatusCode.UNIMPLEMENTED).toBe(12);
    expect(GrpcStatusCode.INTERNAL).toBe(13);
    expect(GrpcStatusCode.UNAVAILABLE).toBe(14);
    expect(GrpcStatusCode.DATA_LOSS).toBe(15);
    expect(GrpcStatusCode.UNAUTHENTICATED).toBe(16);
  });

  it('maps invalid input and validation error codes to INVALID_ARGUMENT', () => {
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'INVALID_INPUT', message: 'invalid property' }),
    ).toBe(GrpcStatusCode.INVALID_ARGUMENT);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'VALIDATION_ERROR', message: 'schema mismatch' }),
    ).toBe(GrpcStatusCode.INVALID_ARGUMENT);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'SCHEMA_VIOLATION', message: 'type constraint' }),
    ).toBe(GrpcStatusCode.INVALID_ARGUMENT);
  });

  it('maps entity not found error codes to NOT_FOUND', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'NOT_FOUND', message: 'entity missing' })).toBe(
      GrpcStatusCode.NOT_FOUND,
    );
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'NODE_NOT_FOUND', message: 'node missing' }),
    ).toBe(GrpcStatusCode.NOT_FOUND);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'EDGE_NOT_FOUND', message: 'edge missing' }),
    ).toBe(GrpcStatusCode.NOT_FOUND);
  });

  it('maps duplicate entity error codes to ALREADY_EXISTS', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'ALREADY_EXISTS', message: 'node exists' })).toBe(
      GrpcStatusCode.ALREADY_EXISTS,
    );
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'DUPLICATE_ENTITY', message: 'id collision' }),
    ).toBe(GrpcStatusCode.ALREADY_EXISTS);
  });

  it('maps concurrency and sequence conflict codes to ABORTED', () => {
    expect(
      mapResultErrorToGrpcStatusCode({
        code: 'CONCURRENCY_CONFLICT',
        message: 'sequence mismatch',
      }),
    ).toBe(GrpcStatusCode.ABORTED);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'SEQUENCE_MISMATCH', message: 'expected 5 got 4' }),
    ).toBe(GrpcStatusCode.ABORTED);
  });

  it('maps auth error codes to UNAUTHENTICATED or PERMISSION_DENIED', () => {
    expect(mapResultErrorToGrpcStatusCode({ code: 'UNAUTHORIZED', message: 'token expired' })).toBe(
      GrpcStatusCode.UNAUTHENTICATED,
    );
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'FORBIDDEN', message: 'insufficient scope' }),
    ).toBe(GrpcStatusCode.PERMISSION_DENIED);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'PERMISSION_DENIED', message: 'access denied' }),
    ).toBe(GrpcStatusCode.PERMISSION_DENIED);
  });

  it('maps resource limit error codes to RESOURCE_EXHAUSTED', () => {
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'RESOURCE_EXHAUSTED', message: 'quota met' }),
    ).toBe(GrpcStatusCode.RESOURCE_EXHAUSTED);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'DEPTH_EXCEEDED', message: 'traversal too deep' }),
    ).toBe(GrpcStatusCode.RESOURCE_EXHAUSTED);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'RATE_LIMIT_EXCEEDED', message: 'too many reqs' }),
    ).toBe(GrpcStatusCode.RESOURCE_EXHAUSTED);
  });

  it('maps unknown or fallback errors to INTERNAL status', () => {
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'UNKNOWN_CRASH', message: 'unhandled exception' }),
    ).toBe(GrpcStatusCode.INTERNAL);
    expect(
      mapResultErrorToGrpcStatusCode({ code: 'INTERNAL_ERROR', message: 'unexpected error' }),
    ).toBe(GrpcStatusCode.INTERNAL);
  });

  it('maps ApiAdapterError categories correctly', () => {
    const error = createApiAdapterError('CONCURRENCY_CONFLICT', 'CAS conflict', { seq: 10 });
    expect(mapResultErrorToGrpcStatusCode(error)).toBe(GrpcStatusCode.ABORTED);
  });

  it('creates complete ConnectRpcError payload preserving error details', () => {
    const errorPayload = {
      code: 'VALIDATION_ERROR',
      message: 'Property age must be positive',
      details: { field: 'age', value: -1 },
    };

    const rpcError: ConnectRpcError = createConnectErrorPayload(errorPayload);
    expect(rpcError.code).toBe(GrpcStatusCode.INVALID_ARGUMENT);
    expect(rpcError.errorCode).toBe('VALIDATION_ERROR');
    expect(rpcError.message).toBe('Property age must be positive');
    expect(rpcError.details).toEqual({ field: 'age', value: -1 });
  });

  it('creates ConnectRpcError from ApiAdapterError category instance', () => {
    const adapterError = createApiAdapterError('NOT_FOUND', 'Node node-123 does not exist');
    const rpcError = createConnectErrorPayload(adapterError);
    expect(rpcError.code).toBe(GrpcStatusCode.NOT_FOUND);
    expect(rpcError.errorCode).toBe('NOT_FOUND');
    expect(rpcError.message).toBe('Node node-123 does not exist');
  });
});
