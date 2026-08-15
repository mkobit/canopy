## 1. Capability vocabulary

- [x] 1.1 Add `render:interactive` to `WasmCapability` and `KNOWN_WASM_CAPABILITIES` in `packages/api-adapter/src/wasm/capabilities.ts`
- [x] 1.2 Mirror `render:interactive` in the `packages/graph` leaf-side vocabulary duplicate; confirm the canopy-3xr cross-package sync guard stays green
- [x] 1.3 Add a test asserting a `render:*` / `*` grant does NOT satisfy an explicit-`render:interactive` gate (wildcard non-conveyance, design decision 2 / finding 5)

## 2. Terminable worker execution transport

- [x] 2.1 Add a worker entry that imports the transpiled guest and calls `executeSandboxedGuestPlugin`, not exposing the `Worker` constructor to the guest (finding 7) — `apps/web/src/plugin/runtime/render-worker.ts` (hardens scope via `hardenGuestWorkerScope`)
- [x] 2.2 Instantiate guest `WebAssembly.Memory` with a hard `maximum` ceiling and use a shorter untrusted-render wall-clock deadline than the 5000 ms Tier-1 default (finding 6) — `createCappedGuestMemory` + `DEFAULT_UNTRUSTED_RENDER_TIMEOUT_MS` in `terminable-execution.ts`
- [x] 2.3 Implement `executeSandboxedGuestPluginInWorker(...)` returning the same `Result<string, ApiAdapterError>`, that `terminate()`s the worker on the wall-clock deadline and resolves a bounded timeout error — `execute-wasm-render-worker.ts` + `executeTerminableGuest`
- [x] 2.4 Marshal `Promise`-returning host-binding calls from the worker back to the main-thread graph over the channel, with the capability-token check enforced main-side (design decision 3a) — `RemoteHostDispatch` seam in `host-bindings.ts`; main-side dispatch table in `execute-wasm-render-worker.ts`
- [x] 2.5 Discard-and-replace a terminated worker (no reused/poisoned state); warm-pool workers for reuse across renders — warm pool + `terminated` discard in `execute-wasm-render-worker.ts`
- [x] 2.6 Unit tests: synchronous-runaway guest is terminated and returns a fallback; memory-bomb guest is bounded by the ceiling; guest cannot outlive terminate via a nested worker; existing fuel/timeout/reentrancy guards still hold inside the worker — `wasm-terminable-execution.test.ts` (real-Worker integration proven via the Tier-2 e2e, task 6.1)

## 3. Tier-2 sandboxed-iframe engine

- [x] 3.1 srcdoc document builder: `sandbox="allow-scripts"` (no `allow-same-origin`), `allow=""`, and an in-document `<meta>` CSP pinning the full directive set — `tier2/sandbox-frame-document.ts`
- [x] 3.2 Guards/tests: sandbox token list never contains `allow-same-origin`; `allow` attribute is empty; CSP contains the full directive set — `tier2/sandbox-frame-document.test.ts`
- [x] 3.3 Bidirectional nonce bridge: per-frame nonce inbound (outbound bootstrap ignores stale-nonce host→frame); `event.source === contentWindow`; strict Zod schema; max size bound; rate-limit; enumerated handler that never writes host DOM attributes — `tier2/frame-bridge.ts` (+ inbound-bootstrap nonce guard in the srcdoc)
- [x] 3.4 Virtualized frame pool bounded to in-viewport blocks (IntersectionObserver + `frame-budget.ts`); recycle recreates the `<iframe>` element via remount (fresh element clears `window.name`/history) with a fresh per-mount nonce (finding 4)
- [x] 3.5 Static preview for off-screen interactive blocks — real-DOM `fallback` shown when off-screen / over budget / pending / given-up
- [x] 3.6 Persistent sandboxed-plugin visual affordance on live Tier-2 frames (border + badge, finding 11)
- [x] 3.7 Frame mount deadline: tear down (release slot) and show static preview if a frame never signals ready — `gaveUp` + `FRAME_MOUNT_DEADLINE_MS`
- [x] 3.8 `Tier2RenderedBlock` component paralleling `WasmRenderedBlock`, with keyed-by-(node id, content hash) stale-render discard — `tier2-rendered-block.tsx`

## 4. Tier selection and dispatch

- [x] 4.1 Route `wasm` renderers by effective granted scope: explicit non-wildcard `render:interactive` → Tier-2, else Tier-1 — `render-tier.ts` + `render-tier.test.ts` (host-grant gate, wildcard non-conveyance, manifest+guest requirements)
- [x] 4.2 Wire the tier branch into `block-renderer.tsx`; system render grant stays `render:raw-html` (`SYSTEM_RENDER_GRANT` unchanged) so first-party static renderers never route to Tier-2
- [x] 4.3 Data minimization: only the single content node's own properties enter a Tier-2 frame, never broad graph/query data — `contentToInput` in `tier2-rendered-block.tsx` (design decision 4a / finding 1)
- [x] 4.4 Regression: the first-party Markdown renderer (no `render:interactive` grant) resolves to Tier-1 — proven by `render-tier.test.ts` default→Tier-1 and the unchanged `wasm-markdown-render.e2e.ts`

## 5. Native shell hardening

- [x] 5.1 Record the required-config invariant: no Tauri IPC surface (`__TAURI__`, `__TAURI_INTERNALS__`, `window.ipc`, custom-protocol handlers) reachable from a render frame; no init-script injection into untrusted subframes — `tier2/native-shell-hardening.ts` doc invariant (finding 12)
- [x] 5.2 Guard/test asserting `__TAURI_INTERNALS__` (not only `__TAURI__`) is absent in a render frame — `hasNoTauriIpcSurface` + `native-shell-hardening.test.ts`

## 6. Proof, benchmark, and docs

- [x] 6.1 Playwright e2e proving Tier-2 isolation: opaque frame renders (posts nonce-keyed `ready`), hostile guest cannot reach host (`__pwned` never set), top-nav blocked (host URL unchanged), host sentinel untouched — `apps/web/e2e/tier2-sandboxed-render.e2e.ts` (uses the REAL builder + sandbox/allow attrs)
- [x] 6.2 Extend `bench-wasm-render.ts` to measure worker spin-up and steady-state Tier-2 round-trip cost — `benchWorker` + `bench-render-worker.ts` (fixture guest through the real `executeSandboxedGuestPlugin` in a Worker)
- [x] 6.3 Resolve canopy-7dj in `docs/design/2026-02-08-extension-and-execution-model.md`: `canopy:ui/render` keeps the raw-HTML contract; the security answer is isolation, referencing this change
- [x] 6.4 Quality gates green: build ✓, lint ✓, typecheck ✓, `bun test` 890 pass ✓, Tier-2 isolation e2e ✓; no fixture plugin seeded into bootstrap, so no node-count test change

## 7. Close-out

- [ ] 7.1 Archive the change (`bunx openspec archive tier2-sandboxed-render-engine --yes`) and sync the 5 delta specs into `openspec/specs/`
- [ ] 7.2 Close canopy-ay6 and canopy-7dj; update memory
