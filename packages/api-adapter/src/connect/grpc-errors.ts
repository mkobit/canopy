import type { ApiAdapterError, ApiErrorCategory } from '../result-errors';

export enum GrpcStatusCode {
  OK = 0,
  CANCELLED = 1,
  UNKNOWN = 2,
  INVALID_ARGUMENT = 3,
  DEADLINE_EXCEEDED = 4,
  NOT_FOUND = 5,
  ALREADY_EXISTS = 6,
  PERMISSION_DENIED = 7,
  RESOURCE_EXHAUSTED = 8,
  FAILED_PRECONDITION = 9,
  ABORTED = 10,
  OUT_OF_RANGE = 11,
  UNIMPLEMENTED = 12,
  INTERNAL = 13,
  UNAVAILABLE = 14,
  DATA_LOSS = 15,
  UNAUTHENTICATED = 16,
}

export type ApiAdapterErrorPayload = Readonly<{
  code: string;
  message: string;
  category?: ApiErrorCategory;
  details?: Readonly<Record<string, unknown>>;
}>;

export type ConnectRpcError = Readonly<{
  code: GrpcStatusCode;
  errorCode: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export const mapResultErrorToGrpcStatusCode = (
  error: ApiAdapterErrorPayload | ApiAdapterError,
): GrpcStatusCode => {
  const codeKey = error.code ?? error.category;

  switch (codeKey) {
    case 'INVALID_INPUT':
    case 'VALIDATION_ERROR':
    case 'SCHEMA_VIOLATION': {
      return GrpcStatusCode.INVALID_ARGUMENT;
    }
    case 'NOT_FOUND':
    case 'NODE_NOT_FOUND':
    case 'EDGE_NOT_FOUND': {
      return GrpcStatusCode.NOT_FOUND;
    }
    case 'ALREADY_EXISTS':
    case 'DUPLICATE_ENTITY': {
      return GrpcStatusCode.ALREADY_EXISTS;
    }
    case 'CONCURRENCY_CONFLICT':
    case 'SEQUENCE_MISMATCH': {
      return GrpcStatusCode.ABORTED;
    }
    case 'UNAUTHORIZED': {
      return GrpcStatusCode.UNAUTHENTICATED;
    }
    case 'FORBIDDEN':
    case 'PERMISSION_DENIED': {
      return GrpcStatusCode.PERMISSION_DENIED;
    }
    case 'DEPTH_EXCEEDED':
    case 'RATE_LIMIT_EXCEEDED':
    case 'RESOURCE_EXHAUSTED': {
      return GrpcStatusCode.RESOURCE_EXHAUSTED;
    }
    default: {
      if (error.category) {
        switch (error.category) {
          case 'VALIDATION_ERROR': {
            return GrpcStatusCode.INVALID_ARGUMENT;
          }
          case 'NOT_FOUND': {
            return GrpcStatusCode.NOT_FOUND;
          }
          case 'CONCURRENCY_CONFLICT': {
            return GrpcStatusCode.ABORTED;
          }
          case 'UNAUTHORIZED': {
            return GrpcStatusCode.UNAUTHENTICATED;
          }
          case 'FORBIDDEN': {
            return GrpcStatusCode.PERMISSION_DENIED;
          }
          case 'RESOURCE_EXHAUSTED': {
            return GrpcStatusCode.RESOURCE_EXHAUSTED;
          }
          case 'INTERNAL_ERROR': {
            return GrpcStatusCode.INTERNAL;
          }
        }
      }
      return GrpcStatusCode.INTERNAL;
    }
  }
};

export const createConnectErrorPayload = (
  error: ApiAdapterErrorPayload | ApiAdapterError,
): ConnectRpcError => ({
  code: mapResultErrorToGrpcStatusCode(error),
  errorCode: error.code ?? error.category ?? 'UNKNOWN',
  message: error.message,
  ...(error.details && { details: error.details }),
});
