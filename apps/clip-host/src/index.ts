/* eslint-disable functional/no-return-void -- stdio event-handler wiring, not domain logic */
import type { JsonRpcId } from '@canopy/api-adapter';
import { resolveDaemonSocketPath } from './config';
import { decodeFrames, encodeFrame } from './framing';
import { createClipHost } from './host';
import { createRateLimiter } from './rate-limiter';

// Native-messaging hosts are browser-launched over stdio, not an interactive
// CLI a human invokes with flags -- see design.md Decision 1's rejected
// "fold into apps/cli" alternative. No @effect/cli here on purpose.
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 1000;

export const runClipHost = (): void => {
  const host = createClipHost({
    socketPath: resolveDaemonSocketPath(),
    rateLimiter: createRateLimiter({
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    }),
  });

  // eslint-disable-next-line functional/no-let -- accumulates partial frames across stdin 'data' events
  let buffer: Buffer = Buffer.alloc(0);

  const reply = async (message: unknown): Promise<void> => {
    const request = message as Readonly<{ method?: unknown; params?: unknown; id?: JsonRpcId }>;
    const response = await host.handleRequest(request);
    const encoded = encodeFrame(response);
    if (encoded.ok) {
      process.stdout.write(encoded.value);
    }
  };

  process.stdin.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    const decoded = decodeFrames(buffer);
    if (!decoded.ok) {
      // Malformed/oversize frame: framing alignment can't be trusted without
      // the exact declared byte count, which we refused to buffer -- drop
      // and wait for the next message rather than risk parsing garbage.
      buffer = Buffer.alloc(0);
      return;
    }
    buffer = decoded.value.remainder;
    // eslint-disable-next-line functional/no-loop-statements -- fire-and-forget dispatch per decoded frame
    for (const message of decoded.value.messages) {
      void reply(message);
    }
  });
};

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runClipHost();
}
