## 1. Capability vocabulary

- [ ] 1.1 Add `render:interactive` to `WasmCapability` and `KNOWN_WASM_CAPABILITIES` in `packages/api-adapter/src/wasm/capabilities.ts`
- [ ] 1.2 Mirror `render:interactive` in the `packages/graph` leaf-side vocabulary duplicate; confirm the canopy-3xr cross-package sync guard stays green
- [ ] 1.3 Add a test asserting a `render:*` / `*` grant does NOT satisfy an explicit-`render:interactive` gate (wildcard non-conveyance, design decision 2 / finding 5)

## 2. Terminable worker execution transport

- [ ] 2.1 Add a worker entry that imports the transpiled guest and calls `executeSandboxedGuestPlugin`, not exposing the `Worker` constructor to the guest (finding 7)
- [ ] 2.2 Instantiate guest `WebAssembly.Memory` with a hard `maximum` ceiling and use a shorter untrusted-render wall-clock deadline than the 5000 ms Tier-1 default (finding 6)
- [ ] 2.3 Implement `executeSandboxedGuestPluginInWorker(...)` returning the same `Result<string, ApiAdapterError>`, that `terminate()`s the worker on the wall-clock deadline and resolves a bounded timeout error
- [ ] 2.4 Marshal `Promise`-returning host-binding calls from the worker back to the main-thread graph over the channel, with the capability-token check enforced main-side (design decision 3a)
- [ ] 2.5 Discard-and-replace a terminated worker (no reused/poisoned state); warm-pool workers for reuse across renders
- [ ] 2.6 Unit tests: synchronous-runaway guest is terminated and returns a fallback; memory-bomb guest is bounded by the ceiling; guest cannot outlive terminate via a nested worker; existing fuel/timeout/reentrancy guards still hold inside the worker

## 3. Tier-2 sandboxed-iframe engine

- [ ] 3.1 srcdoc document builder: `sandbox="allow-scripts"` (no `allow-same-origin`), `allow=""`, and an in-document `<meta>` CSP pinning the full directive set (`default-src 'none'`, `connect-src 'none'`, `object-src 'none'`, `frame-src 'none'`, `worker-src 'none'`, `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'none'`)
- [ ] 3.2 Guards/tests: sandbox token list never contains `allow-same-origin`; `allow` attribute is empty; CSP contains the full directive set
- [ ] 3.3 Bidirectional nonce bridge: per-frame cryptographic nonce on inbound AND outbound messages; `event.source === contentWindow` check; strict Zod schemas (`.strict()`); max serialized-message-size bound; frequency rate-limit; fixed indirect enumerated-action handler that never writes host DOM attributes
- [ ] 3.4 Virtualized recycled frame pool bounded to in-viewport blocks; on recycle, recreate the `<iframe>` element or reset its `name` before the new `srcdoc`, and rotate the nonce (finding 4)
- [ ] 3.5 Static preview for off-screen interactive blocks (representation settled against a real renderer)
- [ ] 3.6 Persistent sandboxed-plugin visual affordance on live Tier-2 frames (finding 11)
- [ ] 3.7 Frame mount deadline: tear down and show static preview if a frame never signals ready
- [ ] 3.8 `Tier2RenderedBlock` component paralleling `WasmRenderedBlock`, with keyed-by-(node id, content hash) stale-render discard

## 4. Tier selection and dispatch

- [ ] 4.1 Route `wasm` renderers by effective granted scope: explicit non-wildcard `render:interactive` → Tier-2, else Tier-1; presence of `render:interactive` forces Tier-2 (finding 14)
- [ ] 4.2 Wire the tier branch into `block-renderer.tsx` / registry; keep the system render grant at `render:raw-html` so first-party static renderers never route to Tier-2
- [ ] 4.3 Data minimization: pass only strictly-needed content into a Tier-2 frame, never broad graph/query data (design decision 4a / finding 1)
- [ ] 4.4 Regression e2e: the first-party Markdown renderer stays on the unchanged Tier-1 path

## 5. Native shell hardening

- [ ] 5.1 Record the required-config invariant: no Tauri IPC surface (`__TAURI__`, `__TAURI_INTERNALS__`, `window.ipc`, custom-protocol handlers) reachable from a render frame; no init-script injection into untrusted subframes (finding 12)
- [ ] 5.2 Guard/test asserting `__TAURI_INTERNALS__` (not only `__TAURI__`) is absent in a render frame

## 6. Proof, benchmark, and docs

- [ ] 6.1 Playwright e2e proving Tier-2 isolation with a fixture `render:interactive` guest: opaque frame renders, hostile script cannot reach the host (`window.__pwned` never set), exfil-attempt navigation is observable/torn-down, host DOM untouched by frame messages
- [ ] 6.2 Extend `apps/web/scripts/bench-wasm-render.ts` to measure worker spin-up and steady-state Tier-2 cost
- [ ] 6.3 Resolve canopy-7dj in `docs/design/2026-02-08-extension-and-execution-model.md`: `canopy:ui/render` keeps the raw-HTML contract; the security answer is isolation, referencing this change
- [ ] 6.4 Run quality gates (build → lint → typecheck → test → e2e); update bootstrap node-count tests only if a fixture plugin is seeded

## 7. Close-out

- [ ] 7.1 Archive the change (`bunx openspec archive tier2-sandboxed-render-engine --yes`) and sync the 5 delta specs into `openspec/specs/`
- [ ] 7.2 Close canopy-ay6 and canopy-7dj; update memory
