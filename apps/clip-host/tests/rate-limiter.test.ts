import { describe, expect, it } from 'bun:test';
import { Effect } from 'effect';
import type { IpcClient } from '@canopy/api-adapter';
import { createClipHost } from '../src/host';
import { createRateLimiter } from '../src/rate-limiter';

describe('createRateLimiter', () => {
  it('7.3 allows up to maxRequests within the window then rejects', () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 1000 });
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(0)).toBe(false);
  });

  it('7.3 allows requests again once the window has elapsed', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });
    expect(limiter.tryAcquire(0)).toBe(true);
    expect(limiter.tryAcquire(500)).toBe(false);
    expect(limiter.tryAcquire(1001)).toBe(true);
  });
});

describe('clip-host rate limiting', () => {
  it('7.3 throttles excess requests at the host without forwarding them to the daemon', async () => {
    const calls: string[] = [];
    const client: IpcClient = {
      handshake: () => {
        calls.push('handshake');
        return Effect.succeed({ apiVersion: 'v1', serverVersion: '0.1.0', capabilities: [] });
      },
    } as unknown as IpcClient;

    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 1, windowMs: 60_000 }),
      connect: () => Effect.succeed(client),
    });

    const first = await host.handleRequest({ method: 'canopy.v1.handshake', id: 1 });
    const second = await host.handleRequest({ method: 'canopy.v1.handshake', id: 2 });

    expect(first.error).toBeUndefined();
    expect(second.error).toBeDefined();
    expect(calls).toEqual(['handshake']);
  });
});

it('Window equality and rejected attempts retain success-only timestamps', () => {
  const limiter = createRateLimiter({ maxRequests: 1, windowMs: 1000 });
  expect([0, 500, 1000, 1001, 2001, 2002].map((now) => limiter.tryAcquire(now))).toEqual([
    true,
    false,
    false,
    true,
    false,
    true,
  ]);
});

it('Isolated state and supplied times retain prefix-only expiry including NaN', () => {
  const first = createRateLimiter({ maxRequests: 2, windowMs: 10 });
  const second = createRateLimiter({ maxRequests: 2, windowMs: 10 });
  expect([10, 0, 15].map((now) => first.tryAcquire(now))).toEqual([true, true, false]);
  expect(second.tryAcquire(15)).toBe(true);
  const nanHead = createRateLimiter({ maxRequests: 1, windowMs: 10 });
  expect(nanHead.tryAcquire(NaN)).toBe(true);
  expect(nanHead.tryAcquire(100)).toBe(false);
  const nanNow = createRateLimiter({ maxRequests: 1, windowMs: 10 });
  expect(nanNow.tryAcquire(0)).toBe(true);
  expect(nanNow.tryAcquire(NaN)).toBe(false);
});

it('Supplied NaN capacity preserves the original rejection comparison', () => {
  const limiter = createRateLimiter({ maxRequests: NaN, windowMs: 10 });
  expect(limiter.tryAcquire(0)).toBe(true);
  expect(limiter.tryAcquire(0)).toBe(true);
});
