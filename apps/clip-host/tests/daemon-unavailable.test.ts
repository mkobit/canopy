import { describe, expect, it } from 'bun:test';
import { Effect } from 'effect';
import { createClipHost } from '../src/host';
import { createRateLimiter } from '../src/rate-limiter';

describe('clip-host daemon-unavailable handling', () => {
  it('7.6 returns a typed error and stays usable when no daemon is listening', async () => {
    // Simulates connect() failing the way it does when no daemon is
    // listening on the resolved socket path (ECONNREFUSED/ENOENT), via the
    // same injected `connect` used by the allowlist/rate-limit tests --
    // exercises this host's own error handling deterministically, since the
    // real net.connect()'s synchronous-throw-on-ENOENT behavior turned out
    // to be inconsistent under this environment's bun test + WSL2 combo (see
    // the ipc-client.ts try/catch this bead also added for the real path).
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () =>
        Effect.fail({
          _tag: 'IpcClientError',
          code: -32_603,
          message: 'Socket error: ECONNREFUSED',
        }),
    });

    const response = await host.handleRequest({ method: 'canopy.v1.handshake', id: 1 });
    expect(response.error).toBeDefined();
    expect(response.error?.message).toContain('daemon unavailable');

    // The host itself doesn't crash or become unusable -- a second call after
    // a daemon-unavailable response still produces a well-formed response,
    // and the captured request is never silently dropped.
    const second = await host.handleRequest({ method: 'canopy.v1.handshake', id: 2 });
    expect(second.error).toBeDefined();
    expect(second.error?.message).toContain('daemon unavailable');
  });

  it('7.6 rejects a disallowed method before ever attempting to connect', async () => {
    const host = createClipHost({
      socketPath: '/unused',
      rateLimiter: createRateLimiter({ maxRequests: 100, windowMs: 1000 }),
      connect: () =>
        Effect.fail({ _tag: 'IpcClientError', code: -32_603, message: 'should not be called' }),
    });

    const response = await host.handleRequest({ method: 'canopy.v1.mutation.deleteNode', id: 1 });
    expect(response.error).toBeDefined();
    expect(response.error?.message).not.toContain('daemon unavailable');
  });
});
