# Extension shared contracts

## Overview

This directory defines the browser extension's shared constants, popup-to-background message contracts, pure clip payload builder and validator, and a dependency-injected JSON-RPC 2.0 native-messaging client. It has no `@canopy/*` package dependencies and enforces size/content validation and wire-protocol error extraction.

## Interface

- `[clip-payload.ts:ClipPayloadError]`, `[clip-payload.ts:ClipPayloadResult]`, `[clip-payload.ts:buildClipPayload]`
- `[constants.ts:NATIVE_HOST_NAME]`, `[constants.ts:MAX_CLIP_CONTENT_BYTES]`, `[constants.ts:STORAGE_KEYS]`
- `[messages.ts:RawClipCapture]`, `[messages.ts:ClipPayload]`, `[messages.ts:PopupRequest]`, `[messages.ts:PreviewSummary]`, `[messages.ts:CaptureErrorReason]`, `[messages.ts:BackgroundResponse]`
- `[native-rpc.ts:JsonRpcResponse]`, `[native-rpc.ts:NativeRpcClient]`, `[native-rpc.ts:createNativeRpcClient]`, `[native-rpc.ts:WireNodeCreatedEvent]`, `[native-rpc.ts:BuildNodeCreatedEventInput]`, `[native-rpc.ts:buildNodeCreatedEvent]`, `[native-rpc.ts:isDaemonUnavailable]`, `[native-rpc.ts:extractRejectedTypeId]`, `[native-rpc.ts:extractConcurrentModificationRevision]`

## Invariants

- `[clip-payload.ts:buildClipPayload]` Selects `capture.selectionText` over `capture.mainText` when `capture.selectionText.trim().length > 0`; rejects empty/whitespace-only content (`'empty-content'`); enforces UTF-8 byte length `<= MAX_CLIP_CONTENT_BYTES` (`500_000`) via `TextEncoder` (`'oversize-content'`).
- `[constants.ts:NATIVE_HOST_NAME]` Equals `'com.canopy.clip_host'`, matching `apps/clip-host/native-messaging-host-manifest.template.json`.
- `[messages.ts:PopupRequest]` and `[messages.ts:BackgroundResponse]` Discriminated unions on `.type`.
- `[native-rpc.ts:createNativeRpcClient]` Assigns monotonically increasing numeric `id` starting at `1` per `call()`; `handleIncoming` ignores messages without a numeric `id` present in `pending`.
- `[native-rpc.ts:buildNodeCreatedEvent]` Purely constructs a `WireNodeCreatedEvent` with `type: 'NodeCreated'` from caller-supplied `eventId`, `nodeId`, `timestamp`, and `deviceId`.
- `[native-rpc.ts:isDaemonUnavailable]`, `[native-rpc.ts:extractRejectedTypeId]`, `[native-rpc.ts:extractConcurrentModificationRevision]` Match exact JSON-RPC error codes `-32_004`, `-32_002`, and `-32_000` (`type === 'concurrent-modification'`).

## Side Effects

- `[native-rpc.ts:createNativeRpcClient]` Mutates internal `nextId` counter and `pending` `Map` (`set`, `delete`, `clear`), invokes the injected `send` callback on `call()`, resolves pending promises in `handleIncoming()`, and rejects all pending promises with `Error(reason)` in `handleDisconnect()`.

## Verification

- Run: `bun test`
