# Tier-2 sandboxed renderer primitives

## Overview

This directory implements security isolation, resource budgeting, and host-frame communication primitives for Tier-2 sandboxed interactive renderers running in opaque-origin iframes. It provides the iframe `srcdoc` CSP and sandbox builder, a nonce-authenticated and rate-limited `postMessage` bridge, a global live-frame slot counter, and a Tauri IPC global-absence guard.

## Interface

- `[frame-bridge.ts:MAX_FRAME_MESSAGE_BYTES]` Constant (`8192`) capping inbound `postMessage` payload size in UTF-8 bytes.
- `[frame-bridge.ts:FRAME_MESSAGE_RATE_LIMIT]` Constant (`64`) and `[frame-bridge.ts:FRAME_MESSAGE_RATE_WINDOW_MS]` (`1000`) configuring the sliding-window rate limit.
- `[frame-bridge.ts:frameInboundMessageSchema]` Strict Zod schema for inbound messages (`{ nonce: string, kind: 'ready' }`), with `[frame-bridge.ts:FrameInboundMessage]` type.
- `[frame-bridge.ts:generateFrameNonce]` Generates a 16-byte hex nonce via `crypto.getRandomValues`.
- `[frame-bridge.ts:validateInboundFrameMessage]` Validates source window, byte size, schema, and nonce, returning `[frame-bridge.ts:FrameMessageOutcome]` (with `[frame-bridge.ts:FrameMessageRejection]` reasons).
- `[frame-bridge.ts:createFrameBridge]` Creates a `[frame-bridge.ts:FrameBridge]` with `handleMessage`, `getNonce`, and `rotateNonce` using `[frame-bridge.ts:FrameBridgeHandlers]`.
- `[frame-budget.ts:MAX_LIVE_TIER2_FRAMES]` Constant (`12`), `[frame-budget.ts:acquireFrameSlot]`, and `[frame-budget.ts:releaseFrameSlot]` for tracking live Tier-2 iframe slots.
- `[native-shell-hardening.ts:TAURI_IPC_SURFACE_GLOBALS]` Tuple (`['__TAURI__', '__TAURI_INTERNALS__', 'ipc']`) and `[native-shell-hardening.ts:hasNoTauriIpcSurface]` guard.
- `[sandbox-frame-document.ts:TIER2_SANDBOX_TOKENS]` (`'allow-scripts'`), `[sandbox-frame-document.ts:TIER2_FRAME_ALLOW]` (`''`), `[sandbox-frame-document.ts:TIER2_FRAME_CSP]`, `[sandbox-frame-document.ts:TIER2_REQUIRED_CSP_DIRECTIVES]`, and `[sandbox-frame-document.ts:buildTier2FrameDocument]` for building sandboxed `srcdoc` HTML.

## Invariants

- `[frame-bridge.ts:validateInboundFrameMessage]` Validates inbound frame messages in strict order: `event.source === expected.frameWindow` (`wrong-source`), UTF-8 serialized JSON byte length `<= MAX_FRAME_MESSAGE_BYTES` (`too-large`), strict Zod `frameInboundMessageSchema` (`malformed`), and `parsed.data.nonce === expected.nonce` (`nonce-mismatch`). Non-serializable payloads evaluate to `Infinity` bytes and fail as `too-large`.
- `[frame-bridge.ts:createFrameBridge]` Enforces a sliding-window rate limit of `FRAME_MESSAGE_RATE_LIMIT` (64) messages per `FRAME_MESSAGE_RATE_WINDOW_MS` (1000 ms), drops excess messages before validation, and dispatches only `'ready'` without mutating host DOM.
- `[frame-budget.ts:acquireFrameSlot]` Caps live Tier-2 frame slots at `MAX_LIVE_TIER2_FRAMES` (12) and returns `false` when `budget.live >= MAX_LIVE_TIER2_FRAMES`.
- `[frame-budget.ts:releaseFrameSlot]` Only decrements `budget.live` when `budget.live > 0`, preventing negative counts.
- `[native-shell-hardening.ts:hasNoTauriIpcSurface]` Returns `true` only when every global in `TAURI_IPC_SURFACE_GLOBALS` (`'__TAURI__'`, `'__TAURI_INTERNALS__'`, `'ipc'`) is `undefined` on `scope`.
- `[sandbox-frame-document.ts:TIER2_SANDBOX_TOKENS]` Uses `'allow-scripts'` only (omitting `allow-same-origin`, navigation, form, modal, and popup tokens) and `[sandbox-frame-document.ts:TIER2_FRAME_ALLOW]` (`''`) to force an opaque null origin and deny Permissions-Policy features.
- `[sandbox-frame-document.ts:TIER2_FRAME_CSP]` Enforces `default-src 'none'`, `script-src 'unsafe-inline' 'wasm-unsafe-eval'`, `style-src 'unsafe-inline'`, `img-src data:`, and `'none'` for `connect-src`, `object-src`, `frame-src`, `worker-src`, `base-uri`, `form-action`, and `frame-ancestors` (listed in `[sandbox-frame-document.ts:TIER2_REQUIRED_CSP_DIRECTIVES]`).
- `[sandbox-frame-document.ts:buildTier2FrameDocument]` Pins `TIER2_FRAME_CSP` via `<meta http-equiv="Content-Security-Policy">`, inserts `bodyHtml` verbatim, and appends a trailing bootstrap script that filters `message` events by nonce.

## Side Effects

- `[frame-bridge.ts:generateFrameNonce]` Reads 16 random bytes from `crypto.getRandomValues`.
- `[frame-bridge.ts:createFrameBridge]` Mutates closure-scoped `nonce` (via `rotateNonce`), `windowStart`, and `windowCount` (via `handleMessage`), reads `performance.now()`, and invokes `handlers.onReady` / `handlers.onRejected`.
- `[frame-budget.ts:acquireFrameSlot]` and `[frame-budget.ts:releaseFrameSlot]` Mutate module-level `budget.live` counter state.
- `[sandbox-frame-document.ts:buildTier2FrameDocument]` Has no host side effects; its generated bootstrap script registers a `window` `message` listener and calls `parent.postMessage({ nonce: N, kind: 'ready' }, '*')` inside the iframe.

## Verification

- Run: `bun test`
