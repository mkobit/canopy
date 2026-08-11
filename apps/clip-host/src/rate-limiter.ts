import { Temporal } from 'temporal-polyfill';

export type RateLimiter = Readonly<{
  /** Records one request attempt at `now` and reports whether it is within the configured rate. */
  tryAcquire: (now?: number) => boolean;
}>;

export type RateLimiterOptions = Readonly<{
  maxRequests: number;
  windowMs: number;
}>;

/**
 * A simple sliding-window rate limiter: at most `maxRequests` calls to
 * `tryAcquire` return `true` within any `windowMs` interval. Excess calls
 * return `false` so the caller can reject/throttle rather than forward
 * unbounded requests to the daemon.
 */
export const createRateLimiter = (options: RateLimiterOptions): RateLimiter => {
  // eslint-disable-next-line functional/prefer-immutable-types -- local accumulator
  const timestamps: number[] = [];

  return {
    tryAcquire: (now = Temporal.Now.instant().epochMilliseconds) => {
      const windowStart = now - options.windowMs;
      // eslint-disable-next-line functional/no-loop-statements
      while (timestamps.length > 0 && (timestamps[0] ?? 0) < windowStart) {
        // eslint-disable-next-line functional/immutable-data
        timestamps.shift();
      }
      if (timestamps.length >= options.maxRequests) {
        return false;
      }
      // eslint-disable-next-line functional/immutable-data
      timestamps.push(now);
      return true;
    },
  };
};
