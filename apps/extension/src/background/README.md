# Extension background service worker

## Overview

This directory implements the Manifest V3 background service worker that bridges popup requests (`stage-clip`, `confirm-commit`, `discard`) to the native-messaging RPC host while managing per-session draft state and cached device/type IDs in `chrome.storage.local`.

## Interface

- `[service-worker.ts:chrome.runtime.onMessage.addListener]` No module exports; registers an MV3 runtime message listener accepting `PopupRequest` (`'stage-clip' | 'confirm-commit' | 'discard'`) and replying asynchronously with `BackgroundResponse`.
- `[service-worker.ts:handleRequest]` Internal request router dispatching `PopupRequest` to `handleStageClip`, `handleConfirmCommit`, and `handleDiscard`.

## Invariants

- `[service-worker.ts:getClient]` Lazily creates and reuses a single `NativeRpcClient` over `chrome.runtime.connectNative(NATIVE_HOST_NAME)`, resetting `activeClient` to `undefined` on `port.onDisconnect`.
- `[service-worker.ts:stageClipEvent]` Attempts `canopy.v1.draft.apply` with cached `STORAGE_KEYS.WEBCLIP_TYPE_ID` or `WEBCLIP_TYPE_PLACEHOLDER` (`'pending-webclip-type'`), and if rejected with `extractRejectedTypeId`, caches the resolved type ID and retries once.
- `[service-worker.ts:commitWithRetry]` On concurrent modification (`extractConcurrentModificationRevision`), re-runs `canopy.v1.draft.preview` before retrying `canopy.v1.draft.commit` once with the fresh parent revision.
- `[service-worker.ts:handleConfirmCommit]` Requires `draftId` to exist in the in-memory `drafts` `Map` (returning `commit-error` otherwise) and deletes it after `commitWithRetry` completes.
- `[service-worker.ts:handleRequest]` Enforces exhaustive switching over `request.type` via `request satisfies never`.
- `[service-worker.ts:chrome.runtime.onMessage.addListener]` Returns `true` synchronously to keep the Chrome message channel open for async `sendResponse`.

## Side Effects

- `[service-worker.ts:chrome.runtime.onMessage.addListener]` Registers a global `chrome.runtime.onMessage` listener at module load.
- `[service-worker.ts:getClient]` Connects a native messaging port via `chrome.runtime.connectNative(NATIVE_HOST_NAME)` and attaches `port.onMessage` and `port.onDisconnect` listeners.
- `[service-worker.ts:getOrCreateDeviceId]` and `[service-worker.ts:cacheWebClipTypeId]` Read/write `STORAGE_KEYS.DEVICE_ID` (generated with `crypto.randomUUID()`) and `STORAGE_KEYS.WEBCLIP_TYPE_ID` in `chrome.storage.local`.
- `[service-worker.ts:handleStageClip]`, `[service-worker.ts:handleConfirmCommit]`, `[service-worker.ts:handleDiscard]` Invoke `canopy.v1.draft.*` RPCs and mutate the module-level `drafts` `Map`.

## Verification

- Run: `bun test`
