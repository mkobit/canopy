import type { GraphAccessError, GraphAccessErrorCategory } from '@canopy/graph-access';

export type WitErrorCode =
  | 'ValidationError'
  | 'NotFound'
  | 'ConcurrencyConflict'
  | 'PermissionDenied'
  | 'ResourceExhausted'
  | 'InternalError';

export const toWitError = (
  error: GraphAccessError,
): Readonly<{
  code: WitErrorCode;
  message: string;
}> => {
  const witCodeMap: Readonly<Record<GraphAccessErrorCategory, WitErrorCode>> = {
    VALIDATION_ERROR: 'ValidationError',
    NOT_FOUND: 'NotFound',
    CONCURRENCY_CONFLICT: 'ConcurrencyConflict',
    UNAUTHORIZED: 'PermissionDenied',
    FORBIDDEN: 'PermissionDenied',
    RESOURCE_EXHAUSTED: 'ResourceExhausted',
    INTERNAL_ERROR: 'InternalError',
  };
  return { code: witCodeMap[error.category], message: error.message };
};
