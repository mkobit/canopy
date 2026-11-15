# WASM plugin host runtime

## Overview

This directory defines the WebAssembly Interface Types (WIT) specification, capability validation and tier resolution, closure-bound host import bindings, and sandboxed/terminable guest execution boundaries. It enforces fuel, memory, reentrancy, worker-scope hardening, and wall-clock termination guards for untrusted WASM plugins.

## Interface

- `[index.ts:*]` Barrel re-exports for the WASM plugin host runtime.
- `[capabilities.ts:WasmCapability]`, `[capabilities.ts:KNOWN_WASM_CAPABILITIES]`, `[capabilities.ts:SENSITIVE_WASM_CAPABILITIES]`, `[capabilities.ts:isSensitiveCapability]`, `[capabilities.ts:isWasmCapability]`, `[capabilities.ts:CapabilityValidator]`, `[capabilities.ts:parseTokenScopes]`, `[capabilities.ts:grantsCapabilityExplicitly]`, `[capabilities.ts:RenderTier]`, `[capabilities.ts:resolveRenderTier]`, `[capabilities.ts:defaultCapabilityValidator]`, `[capabilities.ts:verifyCapability]`, `[capabilities.ts:intersectCapabilities]` Capability parsing, validation, intersection, and tier resolution.
- `[host-bindings.ts:WitErrorPayload]`, `[host-bindings.ts:FuelMeter]`, `[host-bindings.ts:ReentrancyGuard]`, `[host-bindings.ts:MemoryChecker]`, `[host-bindings.ts:RemoteHostDispatch]`, `[host-bindings.ts:WasmHostBindingsOptions]`, `[host-bindings.ts:WasmHostQueryBindings]`, `[host-bindings.ts:WasmHostMutationBindings]`, `[host-bindings.ts:WasmHostEventBindings]`, `[host-bindings.ts:WasmHostBindings]`, `[host-bindings.ts:createWasmHostBindings]` Closure-bound host import bindings.
- `[sandboxed-executor.ts:DEFAULT_WASM_FUEL_LIMIT]`, `[sandboxed-executor.ts:DEFAULT_WASM_MAX_MEMORY_BYTES]`, `[sandboxed-executor.ts:DEFAULT_WASM_TIMEOUT_MS]`, `[sandboxed-executor.ts:WasmGuestPlugin]`, `[sandboxed-executor.ts:SandboxedExecutionOptions]`, `[sandboxed-executor.ts:createFuelMeter]`, `[sandboxed-executor.ts:createReentrancyGuard]`, `[sandboxed-executor.ts:createMemoryChecker]`, `[sandboxed-executor.ts:executeSandboxedGuestPlugin]` Fuel/memory/reentrancy/timeout sandboxed executor.
- `[terminable-execution.ts:DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS]`, `[terminable-execution.ts:GUEST_MEMORY_MAX_PAGES]`, `[terminable-execution.ts:createCappedGuestMemory]`, `[terminable-execution.ts:PROHIBITED_WORKER_GLOBALS]`, `[terminable-execution.ts:ProhibitedWorkerGlobal]`, `[terminable-execution.ts:hardenGuestWorkerScope]`, `[terminable-execution.ts:TerminableGuestRunner]`, `[terminable-execution.ts:executeTerminableGuest]` Capped memory, worker hardening, and wall-clock terminable runner.
- `[wasm-adapter.ts:WasmAdapterOptions]`, `[wasm-adapter.ts:WasmGuestPluginExecutor]`, `[wasm-adapter.ts:WasmAdapterServices]`, `[wasm-adapter.ts:WasmAdapter]`, `[wasm-adapter.ts:createWasmAdapter]` Adapter factory combining WIT spec, host bindings, and executor.
- `[wit-spec.ts:CANOPY_WIT_SPECIFICATION]` WIT specification string.

## Invariants

- `[capabilities.ts:SENSITIVE_WASM_CAPABILITIES]` Requires exact literal scope matches for `render:interactive`, `network:connect`, and `write:*` (rejecting wildcards); `[capabilities.ts:resolveRenderTier]` requires explicit non-wildcard `render:interactive` for `'tier2'`, defaulting otherwise to `'tier1'`.
- `[host-bindings.ts:invokeHostBinding]` Fails closed with `FORBIDDEN` if `options.boundToken` is omitted or whitespace-only, ignores caller-supplied `_callerToken`, and enforces `reentrancyGuard`, `fuelMeter` (`100n` default), `memoryChecker`, and capability verification even when `remoteDispatch` is used.
- `[sandboxed-executor.ts:executeSandboxedGuestPlugin]` Bounds UTF-8 input/output bytes (`16 MiB` default), fuel (`1_000_000n` default), reentrancy, and timeout (`5000ms` default).
- `[terminable-execution.ts:createCappedGuestMemory]` Caps WebAssembly linear memory at `GUEST_MEMORY_MAX_PAGES` (`256` pages = 16 MiB).
- `[terminable-execution.ts:hardenGuestWorkerScope]` Removes or locks `PROHIBITED_WORKER_GLOBALS` (`Worker`, `SharedWorker`, `fetch`, `WebSocket`, `XMLHttpRequest`, `indexedDB`) as non-writable/non-configurable `undefined` and freezes prototypes up to `Object.prototype`.
- `[terminable-execution.ts:executeTerminableGuest]` Races `runner.execute()` against a host-owned deadline (`2000ms` default), calling `runner.terminate()` and returning `RESOURCE_EXHAUSTED` on timeout.

## Side Effects

- `[host-bindings.ts:invokeHostBinding]` Mutates `fuelMeter` and `reentrancyGuard` state, reads `Temporal.Now.instant().epochMilliseconds`, and dispatches `options.remoteDispatch` or `@canopy/graph-access` executors.
- `[sandboxed-executor.ts:executeSandboxedGuestPlugin]` and `[terminable-execution.ts:executeTerminableGuest]` Schedule/clear `setTimeout` timers and invoke guest callbacks / `runner.terminate()`.
- `[terminable-execution.ts:createCappedGuestMemory]` Allocates `WebAssembly.Memory`; `[terminable-execution.ts:hardenGuestWorkerScope]` mutates and freezes the target scope and its prototype chain in-place.

## Verification

- Run: `bun test`
