# Plugin runtime

## Overview

This directory implements the Tier-1 inline Markdown WASM guest adapter and the Tier-2 Web Worker runtime, including its Zod wire protocol and allowed guest registry.

## Interface

- `[markdown-render-plugin.ts:markdownRenderGuest]` Tier-1 inline Markdown WASM guest adapter.
- `[worker-guests.ts:WORKER_GUESTS]` Registry of allowed Web Worker guests (`'fixture:interactive'`).
- `[worker-protocol.ts:serializedResultSchema]`, `[worker-protocol.ts:SerializedResult]` Schema and type for serialized host/guest results.
- `[worker-protocol.ts:executeRequestSchema]`, `[worker-protocol.ts:ExecuteRequest]` Schema and type for worker execution requests.
- `[worker-protocol.ts:hostResultSchema]`, `[worker-protocol.ts:workerInboundSchema]` Schemas for inbound worker messages.
- `[worker-protocol.ts:hostCallSchema]`, `[worker-protocol.ts:HostCall]`, `[worker-protocol.ts:executeResultSchema]` Schemas and types for outbound host-call and execution-result messages.

## Invariants

- `[markdown-render-plugin.ts:getCoreModule]` Throws `Error` if the requested core module name is not in `CORE_MODULE_URLS` (`plugin.core.wasm` through `plugin.core4.wasm`).
- `[markdown-render-plugin.ts:instantiateOnce]` Caches `instancePromise` in a module-level singleton so the Markdown WASM component is instantiated once and reused, with `canopy:graph/plugin-manifest` bound to `{}`.
- `[render-worker.ts:hardenGuestWorkerScope]` Hardens `globalThis` at module load to prevent nested-worker creation.
- `[render-worker.ts:buildStubContext]` Uses a worker-local stub graph (`render-worker-stub`) for `executeSandboxedGuestPlugin` rather than a real graph, falling back to `undefined` if `createGraph` fails.
- `[render-worker.ts:runExecute]` Posts a `NOT_FOUND` error result when `guestId` is absent from `WORKER_GUESTS` or `stubContext` is `undefined`.
- `[render-worker.ts:makeRemoteDispatch]` Assigns monotonically increasing `callId` (`` `${requestId}:${sequence.next}` ``), hardcodes group to `'queries'`, and maps failed `SerializedResult` values to code `'InternalError'`.
- `[render-worker.ts:addEventListener]` Validates every inbound message with `workerInboundSchema.safeParse` and ignores invalid payloads; removes resolved `callId` entries from `pendingHostCalls`.
- `[worker-guests.ts:WORKER_GUESTS]` Registers only `'fixture:interactive'` (`interactiveFixtureGuest`); the first-party Markdown guest is excluded from the worker registry.
- `[worker-protocol.ts:executeRequestSchema]` Enforces `.strict()` object shapes across all protocol schemas, positive integer `timeoutMs`, and `hostCallSchema.group` in `['queries', 'mutations', 'events']`.

## Side Effects

- `[markdown-render-plugin.ts:getCoreModule]` Fetches WASM binaries via `fetch(url)` and compiles them with `WebAssembly.compile`.
- `[markdown-render-plugin.ts:instantiateOnce]` Mutates module-level `instancePromise` and instantiates the WASM component via `instantiate`.
- `[render-worker.ts:hardenGuestWorkerScope]` Mutates `globalThis` on module evaluation.
- `[render-worker.ts:addEventListener]` Registers a global `'message'` listener on the Web Worker scope.
- `[render-worker.ts:makeRemoteDispatch]` Increments `sequence.next`, mutates `pendingHostCalls` (`set`/`delete`), and calls `postMessage` with kind `'host-call'`.
- `[render-worker.ts:runExecute]` and `[render-worker.ts:reportExecutionFailure]` Call `postMessage` with kind `'result'` on completion, missing guest, or uncaught rejection (`INTERNAL_ERROR`).

## Verification

- Run: `bun test`
