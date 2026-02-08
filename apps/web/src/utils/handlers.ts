export const toHandler = <A extends unknown[]>(
  fn: (...args: A) => unknown,
): ((...args: A) => undefined) => {
  // eslint-disable-next-line functional/functional-parameters
  return (...args: A) => {
    fn(...args);
    return;
  };
};
