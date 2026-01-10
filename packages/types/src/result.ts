
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

// Helper for testing or when you are sure it won't fail (will throw if it is an error)
// eslint-disable-next-line functional/no-throw-statements
export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.ok) {
        return result.value;
    }
    // eslint-disable-next-line functional/no-throw-statements
    throw result.error;
}

export function fromThrowable<T>(fn: () => T): Result<T, Error> {
  try {
    return ok(fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export async function fromAsyncThrowable<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
