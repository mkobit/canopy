import type { Result } from '@canopy/graph';
import { showAlert } from './dialogs';

export const toHandler = <A extends unknown[]>(
  function_: (...arguments_: A) => unknown,
): ((...arguments_: A) => undefined) => {
  // eslint-disable-next-line functional/functional-parameters
  return (...arguments_: A) => {
    function_(...arguments_);
    return;
  };
};

export const withResultAlert = <A extends unknown[], T, E extends Error>(
  function_: (...arguments_: A) => Promise<Result<T, E>> | Result<T, E>,
  errorMessage: string,
  onSuccess?: (value: T) => unknown,
): ((...arguments_: A) => Promise<undefined>) => {
  // eslint-disable-next-line functional/functional-parameters
  return async (...arguments_: A) => {
    const result = await function_(...arguments_);
    if (!result.ok) {
      console.error(errorMessage, result.error);
      showAlert(errorMessage + (result.error.message ? ': ' + result.error.message : ''));
    } else if (onSuccess) {
      onSuccess(result.value);
    }
    return undefined;
  };
};
