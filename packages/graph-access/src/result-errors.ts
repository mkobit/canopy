import type { Result } from '@canopy/graph';
import { err, isErr, isOk, ok } from '@canopy/graph';

export type GraphAccessErrorCategory =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONCURRENCY_CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RESOURCE_EXHAUSTED'
  | 'INTERNAL_ERROR';

export type GraphAccessError = Readonly<{
  code: string;
  message: string;
  category: GraphAccessErrorCategory;
  details?: unknown;
}>;

export const createGraphAccessError = (
  category: GraphAccessErrorCategory,
  message: string,
  details?: unknown,
): GraphAccessError => ({
  code: category,
  message,
  category,
  ...(details !== undefined && { details }),
});

export const inferCategoryFromError = (error: Error): GraphAccessErrorCategory => {
  const message = error.message.toLowerCase();
  if (message.includes('not found') || message.includes('does not exist')) return 'NOT_FOUND';
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
  if (message.includes('forbidden') || message.includes('permission denied')) return 'FORBIDDEN';
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

const isGraphAccessError = (error: unknown): error is GraphAccessError =>
  typeof error === 'object' &&
  error !== null &&
  'category' in error &&
  'message' in error &&
  typeof error.message === 'string';

export const toGraphAccessError = (
  error: unknown,
  categoryOverride?: GraphAccessErrorCategory,
): GraphAccessError => {
  if (isGraphAccessError(error)) {
    return categoryOverride === undefined
      ? error
      : createGraphAccessError(categoryOverride, error.message, error.details);
  }

  const errorInstance = error instanceof Error ? error : new Error(String(error));
  return createGraphAccessError(
    categoryOverride ?? inferCategoryFromError(errorInstance),
    errorInstance.message,
  );
};

export const mapKernelResultToGraphAccessResult = <T>(
  result: Result<T, Error>,
  categoryOverride?: GraphAccessErrorCategory,
): Result<T, GraphAccessError> => {
  if (isOk(result)) return ok(result.value);
  if (isErr(result)) return err(toGraphAccessError(result.error, categoryOverride));
  return err(createGraphAccessError('INTERNAL_ERROR', 'Unknown result state'));
};
