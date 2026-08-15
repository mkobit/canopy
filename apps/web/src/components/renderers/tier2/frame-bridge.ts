import { z } from 'zod';

// Nonce-keyed, schema-validated, size-bounded, rate-limited host↔frame bridge
// (design decision 5). Opaque frames all report `origin === "null"`, so origin
// cannot authenticate a message; authentication is by an unguessable per-frame
// nonce plus an `event.source === contentWindow` identity check. Inbound messages
// are validated against a strict Zod schema and dispatched through a fixed
// enumerated handler that NEVER writes a host DOM attribute (the Logseq
// sandbox-escape class).

// Max serialized inbound message size. A single oversized payload is
// structured-cloned into host memory before Zod runs and can OOM regardless of
// frequency (finding 9), so size is checked before any heavier processing.
export const MAX_FRAME_MESSAGE_BYTES = 8 * 1024;

// Max inbound messages per window before excess is dropped (frequency abuse).
export const FRAME_MESSAGE_RATE_LIMIT = 64;
export const FRAME_MESSAGE_RATE_WINDOW_MS = 1000;

// Enumerated inbound actions. Deliberately tiny and side-effect-free on the host
// DOM: `ready` is a mount signal only. No action carries data the host writes
// into its own DOM.
export const frameInboundMessageSchema = z
  .object({
    nonce: z.string().min(1),
    kind: z.literal('ready'),
  })
  .strict();
export type FrameInboundMessage = z.infer<typeof frameInboundMessageSchema>;

// Generates an unguessable per-frame nonce from the platform CSPRNG.
export const generateFrameNonce = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
};

export type FrameMessageRejection = 'wrong-source' | 'too-large' | 'malformed' | 'nonce-mismatch';

export type FrameMessageOutcome =
  | Readonly<{ accepted: true; message: FrameInboundMessage }>
  | Readonly<{ accepted: false; reason: FrameMessageRejection }>;

const serializedSize = (data: unknown): number => {
  // eslint-disable-next-line functional/no-try-statements -- non-serializable payloads are treated as oversized/malformed
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return Infinity;
  }
};

// Pure inbound-message gate: source identity → size → schema (`.strict()`, which
// also neutralizes `__proto__`-key pollution) → nonce match. Any failure drops
// the message. Stateless; the rate limit is layered on in `createFrameBridge`.
export const validateInboundFrameMessage = (
  event: Readonly<{ source: unknown; data: unknown }>,
  expected: Readonly<{ nonce: string; frameWindow: unknown }>,
): FrameMessageOutcome => {
  if (event.source !== expected.frameWindow) {
    return { accepted: false, reason: 'wrong-source' };
  }
  if (serializedSize(event.data) > MAX_FRAME_MESSAGE_BYTES) {
    return { accepted: false, reason: 'too-large' };
  }
  const parsed = frameInboundMessageSchema.safeParse(event.data);
  if (!parsed.success) {
    return { accepted: false, reason: 'malformed' };
  }
  if (parsed.data.nonce !== expected.nonce) {
    return { accepted: false, reason: 'nonce-mismatch' };
  }
  return { accepted: true, message: parsed.data };
};

export type FrameBridgeHandlers = Readonly<{
  onReady?: () => void;
  onRejected?: (reason: FrameMessageRejection) => void;
}>;

export type FrameBridge = Readonly<{
  handleMessage: (event: Readonly<{ source: unknown; data: unknown }>) => void;
  // Rotate the nonce when the frame is recycled to a new block (finding 4/8).
  rotateNonce: (nonce: string) => void;
}>;

// Stateful bridge over the pure gate: adds the per-frame nonce (rotatable) and a
// sliding-window rate limit. Dispatches only the enumerated `ready` action.
export const createFrameBridge = (
  initialNonce: string,
  getFrameWindow: () => unknown,
  handlers: FrameBridgeHandlers = {},
): FrameBridge => {
  // eslint-disable-next-line functional/no-let -- rotatable per-frame nonce
  let nonce = initialNonce;
  // eslint-disable-next-line functional/no-let -- sliding-window rate-limit state
  let windowStart = 0;
  // eslint-disable-next-line functional/no-let -- sliding-window rate-limit state
  let windowCount = 0;

  const withinRateLimit = (): boolean => {
    const now = performance.now();
    if (now - windowStart > FRAME_MESSAGE_RATE_WINDOW_MS) {
      windowStart = now;
      windowCount = 0;
    }
    windowCount += 1;
    return windowCount <= FRAME_MESSAGE_RATE_LIMIT;
  };

  return {
    handleMessage: (event): void => {
      if (!withinRateLimit()) {
        return;
      }
      const outcome = validateInboundFrameMessage(event, {
        nonce,
        frameWindow: getFrameWindow(),
      });
      if (!outcome.accepted) {
        handlers.onRejected?.(outcome.reason);
        return;
      }
      if (outcome.message.kind === 'ready') {
        handlers.onReady?.();
      }
    },
    rotateNonce: (next): void => {
      nonce = next;
    },
  };
};
