import type { GraphAccessError, GraphAccessErrorCategory } from '@canopy/graph-access';
import { GrpcStatusCode } from './connect/grpc-errors';

export { GrpcStatusCode } from './connect/grpc-errors';

export const toGrpcStatus = (
  error: GraphAccessError,
): Readonly<{
  code: GrpcStatusCode;
  message: string;
  details?: unknown;
}> => {
  const codeMap: Readonly<Record<GraphAccessErrorCategory, GrpcStatusCode>> = {
    VALIDATION_ERROR: GrpcStatusCode.INVALID_ARGUMENT,
    NOT_FOUND: GrpcStatusCode.NOT_FOUND,
    UNAUTHORIZED: GrpcStatusCode.PERMISSION_DENIED,
    FORBIDDEN: GrpcStatusCode.PERMISSION_DENIED,
    RESOURCE_EXHAUSTED: GrpcStatusCode.RESOURCE_EXHAUSTED,
    CONCURRENCY_CONFLICT: GrpcStatusCode.ABORTED,
    INTERNAL_ERROR: GrpcStatusCode.INTERNAL,
  };
  return {
    code: codeMap[error.category],
    message: error.message,
    ...(error.details !== undefined && { details: error.details }),
  };
};

export const toGraphQLExtensions = (
  error: GraphAccessError,
): Readonly<{
  code: string;
  category: GraphAccessErrorCategory;
  details?: unknown;
}> => ({
  code: error.code,
  category: error.category,
  ...(error.details !== undefined && { details: error.details }),
});
