export const toHandler = <A extends unknown[]>(fn: (...args: A) => unknown): ((...args: A) => undefined) => {
  return (...args: A) => {
    fn(...args);
    return undefined;
  };
};
