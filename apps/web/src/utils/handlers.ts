// eslint-disable-next-line functional/functional-parameters
export const toHandler = <A extends unknown[]>(fn: (...args: A) => unknown): ((...args: A) => undefined) => {
  // eslint-disable-next-line functional/functional-parameters
  return (...args: A) => {
    // eslint-disable-next-line functional/functional-parameters
    fn(...args);
    return undefined;
  };
};
