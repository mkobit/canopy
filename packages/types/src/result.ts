export type Result<T, E = Error> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Helper for testing or when you are sure it won't fail (will throw if it is an error).
 * This function intentionally throws to unwrap the value or fail hard if it's an error.
 */

export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value;
  }
  // eslint-disable-next-line functional/no-throw-statements -- Intentionally throws to unwrap the value or fail hard
  throw result.error;
}

export function fromThrowable<T>(
  fn: () => T,
  errorHandler?: (e: unknown) => Error,
): Result<T, Error> {
  // eslint-disable-next-line functional/no-try-statements
  try {
    return ok(fn());
  } catch (error_) {
    const error = errorHandler
      ? errorHandler(error_)
      : error_ instanceof Error
        ? error_
        : new Error(String(error_));
    return err(error);
  }
}

export async function fromAsyncThrowable<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  // eslint-disable-next-line functional/no-try-statements
  try {
    return ok(await fn());
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
