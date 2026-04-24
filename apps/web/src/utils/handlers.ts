import type { Result } from '@canopy/types';
import { showAlert } from './dialogs';

export const toHandler = <A extends unknown[]>(
  fn: (...args: A) => unknown,
): ((...args: A) => undefined) => {
  // eslint-disable-next-line functional/functional-parameters
  return (...args: A) => {
    fn(...args);
    return;
  };
};

export const withResultAlert = <A extends unknown[], T, E extends Error>(
  fn: (...args: A) => Promise<Result<T, E>> | Result<T, E>,
  errorMessage: string,
  onSuccess?: (val: T) => unknown,
): ((...args: A) => Promise<undefined>) => {
  // eslint-disable-next-line functional/functional-parameters
  return async (...args: A) => {
    const result = await fn(...args);
    if (!result.ok) {
      console.error(errorMessage, result.error);
      showAlert(errorMessage + (result.error.message ? ': ' + result.error.message : ''));
    } else if (onSuccess) {
      onSuccess(result.value);
    }
    return undefined;
  };
};
