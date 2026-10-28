import type { JsonRpcId } from '@canopy/api-adapter';
import { Effect, Ref } from 'effect';
import { resolveDaemonSocketPath } from './config';
import { decodeFrames, encodeFrame } from './framing';
import { createClipHost } from './host';
import { createRateLimiter } from './rate-limiter';

// Native-messaging hosts are browser-launched over stdio, not an interactive
// CLI a human invokes with flags -- see design.md Decision 1's rejected
// "fold into apps/cli" alternative. No @effect/cli here on purpose.
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 1000;

export const runClipHost = () => {
  const host = createClipHost({
    socketPath: resolveDaemonSocketPath(),
    rateLimiter: createRateLimiter({
      maxRequests: RATE_LIMIT_MAX_REQUESTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    }),
  });

  const buffer = Ref.makeUnsafe<Buffer>(Buffer.alloc(0));

  const reply = async (message: unknown): Promise<boolean> => {
    const request = message as Readonly<{ method?: unknown; params?: unknown; id?: JsonRpcId }>;
    const response = await host.handleRequest(request);
    const encoded = encodeFrame(response);
    return encoded.ok && process.stdout.write(encoded.value);
  };

  return process.stdin.on('data', (chunk: Buffer) => {
    const messages = Effect.runSync(
      Ref.modify(buffer, (previous) => {
        const decoded = decodeFrames(Buffer.concat([previous, chunk]));
        // A framing failure invalidates alignment; clear all buffered bytes.
        return decoded.ok
          ? ([decoded.value.messages, decoded.value.remainder] as const)
          : ([[], Buffer.alloc(0)] as const);
      }),
    );
    // Start every reply immediately; independent completion determines wire order.
    return messages.map(reply);
  });
};

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  runClipHost();
}
