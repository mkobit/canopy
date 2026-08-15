import { describe, it, expect } from 'bun:test';
import {
  createFrameBridge,
  FRAME_MESSAGE_RATE_LIMIT,
  generateFrameNonce,
  MAX_FRAME_MESSAGE_BYTES,
  validateInboundFrameMessage,
} from './frame-bridge';

const frameWindow = { id: 'frame' };
const nonce = 'abc123';
const readyData = { nonce, kind: 'ready' };

describe('generateFrameNonce', () => {
  it('produces a 32-char hex nonce and does not repeat', () => {
    const a = generateFrameNonce();
    const b = generateFrameNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
  });
});

describe('validateInboundFrameMessage', () => {
  it('accepts a well-formed, correctly-sourced, nonce-matching message', () => {
    const outcome = validateInboundFrameMessage(
      { source: frameWindow, data: readyData },
      { nonce, frameWindow },
    );
    expect(outcome.accepted).toBe(true);
  });

  it('drops a message from a foreign source (event.source mismatch)', () => {
    const outcome = validateInboundFrameMessage(
      { source: { id: 'other' }, data: readyData },
      { nonce, frameWindow },
    );
    expect(outcome).toEqual({ accepted: false, reason: 'wrong-source' });
  });

  it('drops an oversized message before schema validation', () => {
    const huge = { nonce, kind: 'ready', pad: 'x'.repeat(MAX_FRAME_MESSAGE_BYTES + 1) };
    const outcome = validateInboundFrameMessage(
      { source: frameWindow, data: huge },
      { nonce, frameWindow },
    );
    expect(outcome).toEqual({ accepted: false, reason: 'too-large' });
  });

  it('drops a message with an unknown property (strict schema)', () => {
    const outcome = validateInboundFrameMessage(
      { source: frameWindow, data: { nonce, kind: 'ready', extra: 1 } },
      { nonce, frameWindow },
    );
    expect(outcome).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('drops a message with an unrecognized action kind', () => {
    const outcome = validateInboundFrameMessage(
      { source: frameWindow, data: { nonce, kind: 'set-attribute' } },
      { nonce, frameWindow },
    );
    expect(outcome).toEqual({ accepted: false, reason: 'malformed' });
  });

  it('drops a __proto__-polluting payload via the strict schema', () => {
    const outcome = validateInboundFrameMessage(
      { source: frameWindow, data: { nonce, kind: 'ready', __proto__: { polluted: true } } },
      { nonce, frameWindow },
    );
    // The extra own-key fails `.strict()`; either way it is not accepted.
    expect(outcome.accepted).toBe(false);
  });

  it('drops a message carrying the wrong nonce', () => {
    const outcome = validateInboundFrameMessage(
      { source: frameWindow, data: { nonce: 'stale', kind: 'ready' } },
      { nonce, frameWindow },
    );
    expect(outcome).toEqual({ accepted: false, reason: 'nonce-mismatch' });
  });
});

describe('createFrameBridge', () => {
  it('invokes onReady for a valid ready message', () => {
    let ready = false;
    const bridge = createFrameBridge(nonce, () => frameWindow, {
      onReady: () => {
        ready = true;
      },
    });
    bridge.handleMessage({ source: frameWindow, data: readyData });
    expect(ready).toBe(true);
  });

  it('rejects messages for the previous nonce after rotation', () => {
    let readyCount = 0;
    const bridge = createFrameBridge(nonce, () => frameWindow, {
      onReady: () => {
        readyCount += 1;
      },
    });
    bridge.rotateNonce('rotated');
    bridge.handleMessage({ source: frameWindow, data: readyData });
    expect(readyCount).toBe(0);
    bridge.handleMessage({ source: frameWindow, data: { nonce: 'rotated', kind: 'ready' } });
    expect(readyCount).toBe(1);
  });

  it('drops messages once the per-window rate limit is exceeded', () => {
    let readyCount = 0;
    const bridge = createFrameBridge(nonce, () => frameWindow, {
      onReady: () => {
        readyCount += 1;
      },
    });
    for (let index = 0; index < FRAME_MESSAGE_RATE_LIMIT + 5; index += 1) {
      bridge.handleMessage({ source: frameWindow, data: readyData });
    }
    expect(readyCount).toBe(FRAME_MESSAGE_RATE_LIMIT);
  });
});
