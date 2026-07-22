import type { Result } from '@canopy/graph';
import { err, isErr, isOk, ok } from '@canopy/graph';

export type ApiErrorCategory =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONCURRENCY_CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RESOURCE_EXHAUSTED'
  | 'INTERNAL_ERROR';

export type GrpcStatusCode =
  | 3 // INVALID_ARGUMENT
  | 5 // NOT_FOUND
  | 7 // PERMISSION_DENIED
  | 8 // RESOURCE_EXHAUSTED
  | 10 // ABORTED
  | 13; // INTERNAL

export type WitErrorCode =
  | 'ValidationError'
  | 'NotFound'
  | 'ConcurrencyConflict'
  | 'PermissionDenied'
  | 'ResourceExhausted'
  | 'InternalError';

export type ApiAdapterError = Readonly<{
  code: string;
  message: string;
  category: ApiErrorCategory;
  details?: Readonly<Record<string, unknown>>;
}>;

export const createApiAdapterError = (
  category: ApiErrorCategory,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiAdapterError => ({
  code: category,
  message,
  category,
  ...(details && { details }),
});

export const inferCategoryFromError = (error: Error): ApiErrorCategory => {
  const message = error.message.toLowerCase();
  if (message.includes('not found') || message.includes('does not exist')) {
    return 'NOT_FOUND';
  }
  if (message.includes('validation') || message.includes('invalid') || message.includes('schema')) {
    return 'VALIDATION_ERROR';
  }
  if (
    message.includes('sequence') ||
    message.includes('conflict') ||
    message.includes('concurrent') ||
    message.includes('cas')
  ) {
    return 'CONCURRENCY_CONFLICT';
  }
  if (message.includes('unauthorized') || message.includes('unauthenticated')) {
    return 'UNAUTHORIZED';
  }
  if (message.includes('forbidden') || message.includes('permission denied')) {
    return 'FORBIDDEN';
  }
  if (
    message.includes('limit') ||
    message.includes('quota') ||
    message.includes('exhausted') ||
    message.includes('fuel') ||
    message.includes('depth') ||
    message.includes('cost')
  ) {
    return 'RESOURCE_EXHAUSTED';
  }
  return 'INTERNAL_ERROR';
};

export const toApiAdapterError = (
  error: unknown,
  categoryOverride?: ApiErrorCategory,
): ApiAdapterError => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'category' in error &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    const adapterErr = error as ApiAdapterError;
    if (categoryOverride !== undefined) {
      return createApiAdapterError(categoryOverride, adapterErr.message, adapterErr.details);
    }
    return adapterErr;
  }

  const errInstance = error instanceof Error ? error : new Error(String(error));
  const category = categoryOverride ?? inferCategoryFromError(errInstance);
  return createApiAdapterError(category, errInstance.message);
};

export const mapKernelResultToApiResult = <T>(
  result: Result<T, Error>,
  categoryOverride?: ApiErrorCategory,
): Result<T, ApiAdapterError> => {
  if (isOk(result)) {
    return ok(result.value);
  }
  if (isErr(result)) {
    return err(toApiAdapterError(result.error, categoryOverride));
  }
  return err(createApiAdapterError('INTERNAL_ERROR', 'Unknown result state'));
};

export const toGrpcStatus = (
  error: ApiAdapterError,
): Readonly<{
  code: GrpcStatusCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}> => {
  const codeMap: Readonly<Record<ApiErrorCategory, GrpcStatusCode>> = {
    VALIDATION_ERROR: 3,
    NOT_FOUND: 5,
    UNAUTHORIZED: 7,
    FORBIDDEN: 7,
    RESOURCE_EXHAUSTED: 8,
    CONCURRENCY_CONFLICT: 10,
    INTERNAL_ERROR: 13,
  };
  return {
    code: codeMap[error.category],
    message: error.message,
    ...(error.details && { details: error.details }),
  };
};

export const toGraphQLExtensions = (
  error: ApiAdapterError,
): Readonly<{
  code: string;
  category: ApiErrorCategory;
  details?: Readonly<Record<string, unknown>>;
}> => ({
  code: error.code,
  category: error.category,
  ...(error.details && { details: error.details }),
});

export const toWitError = (
  error: ApiAdapterError,
): Readonly<{
  code: WitErrorCode;
  message: string;
}> => {
  const witCodeMap: Readonly<Record<ApiErrorCategory, WitErrorCode>> = {
    VALIDATION_ERROR: 'ValidationError',
    NOT_FOUND: 'NotFound',
    CONCURRENCY_CONFLICT: 'ConcurrencyConflict',
    UNAUTHORIZED: 'PermissionDenied',
    FORBIDDEN: 'PermissionDenied',
    RESOURCE_EXHAUSTED: 'ResourceExhausted',
    INTERNAL_ERROR: 'InternalError',
  };
  return {
    code: witCodeMap[error.category],
    message: error.message,
  };
};
