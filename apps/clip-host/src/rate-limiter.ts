import { Effect, Ref } from 'effect';

export type RateLimiter = Readonly<{
  /**
  Records one request attempt at `now` and reports whether it is within the configured rate.
  */
  tryAcquire: (now?: number) => boolean;
}>;

export type RateLimiterOptions = Readonly<{
  maxRequests: number;
  windowMs: number;
}>;

/**
A simple sliding-window rate limiter: at most `maxRequests` calls to
`tryAcquire` return `true` within any `windowMs` interval. Excess calls
return `false` so the caller can reject/throttle rather than forward
unbounded requests to the daemon.
*/
export const createRateLimiter = (options: RateLimiterOptions): RateLimiter => {
  const timestamps = Ref.makeUnsafe<readonly number[]>([]);

  return {
    tryAcquire: (now = Temporal.Now.instant().epochMilliseconds) =>
      Effect.runSync(
        Ref.modify(timestamps, (previous) => {
          const windowStart = now - options.windowMs;
          // Stop at the first unexpired head, including incomparable NaN values.
          const head = previous.findIndex((timestamp) => !(timestamp < windowStart));
          const retained = head === -1 ? [] : previous.slice(head);
          const acquired = !(retained.length >= options.maxRequests);
          return [acquired, acquired ? [...retained, now] : retained] as const;
        }),
      ),
  };
};
