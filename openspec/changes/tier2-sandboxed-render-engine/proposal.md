## Why

Tier-1 rendering (`content-rendering-plugin`, canopy-586) shipped with two deliberately accepted residual risks that block any _untrusted third-party_ rendering plugin from ever running:

1. **Execution is not terminable.** `executeSandboxedGuestPlugin` bounds a guest with `Promise.race` + `setTimeout` and a fuel meter, but the timer only fires if the guest yields and the fuel meter only accounts host-import calls — so a guest whose exported render function runs a synchronous compute loop hangs the main thread and neither guard fires. Accepted only because the Markdown plugin is first-party.
2. **There is no origin isolation for live output.** Tier-1's entire XSS defense is DOMPurify; the closed shadow DOM contains CSS and DOM clobbering but not script execution, so a sanitizer bypass is a full host XSS, and any renderer that legitimately needs live JS or an interactive WASM visualizer cannot be expressed at all.

The safety model for both is already settled in [docs/research/2026-08-14-safe-rendering-untrusted-plugin-output.md](../../../docs/research/2026-08-14-safe-rendering-untrusted-plugin-output.md) (the "Tier 2" sections) and this change is that document's designated follow-on ("Change B"). It also absorbs canopy-7dj: the `canopy:ui/render` HTML-output interface (`docs/design/2026-02-08-extension-and-execution-model.md`) has never had a security design pass, and this is where it gets one.

## What Changes

- **Terminable guest execution (Web Worker isolation).** Add a worker-hosted execution path so `executeSandboxedGuestPlugin` runs off the main thread and the host can `terminate()` the worker on a wall-clock timeout, closing the synchronous-runaway hole. This upgrades the execution boundary for _all_ untrusted guests, not only live-JS ones — a Tier-1 static renderer authored by a third party also needs it.
- **Tier-2 sandboxed-iframe render engine.** Render live/interactive plugin output in a `srcdoc` iframe with `sandbox="allow-scripts"` and `allow-same-origin` **omitted** (opaque null origin), a CSP delivered via `<meta http-equiv>` _inside_ the srcdoc, and `connect-src 'none'` to close network exfiltration. Works fully offline with no second origin and no network dependency.
- **Nonce-keyed, schema-validated host↔frame bridge.** Every frame is assigned a cryptographic `instanceNonce`; `postMessage` traffic is keyed by it, validated against strict Zod schemas (`additionalProperties:false`, drop on mismatch), rate-limited, and dispatched indirectly. The host **never** sets a host DOM attribute from a frame message (the Logseq sandbox-escape class).
- **Virtualized recycled frame pool.** Never one iframe per block (~2–5 MB/frame → >1.5 GB at 300 blocks, broken cross-frame selection, a screen-reader region per block). Keep a small pool (~10–15) of in-viewport active frames; off-screen blocks render a static preview.
- **Tier selection.** A renderer signals it needs live output (Tier-2) versus static output (Tier-1) through the capability vocabulary; the render dispatch resolves the tier and routes to the sanitized-inline path or the iframe engine accordingly. Static renderers keep the cheaper Tier-1 path.
- **Tauri hardening.** Set `withGlobalTauri: false` so the `window.__TAURI__` IPC bridge is never injected into an untrusted webview; native access stays gated behind capability manifests.
- **`canopy:ui/render` security resolution (canopy-7dj).** Record the decision that the render output contract stays a raw-HTML string rendered under isolation (not restructured to a declarative AST), with the isolation model above as its adversarial-review answer.

## Capabilities

### New Capabilities

- `terminable-plugin-execution`: run a sandboxed guest in a Web Worker the host can forcibly terminate on a wall-clock timeout, so a synchronous-runaway guest cannot hang the main thread.
- `sandboxed-iframe-rendering`: render untrusted live/interactive plugin output inside an opaque-origin `srcdoc` iframe with an inner meta-CSP, a nonce-keyed schema-validated `postMessage` bridge, a virtualized frame pool, and Tauri global-injection hardening.

### Modified Capabilities

- `content-rendering-plugin`: add a tier-selection requirement and the Tier-2 escalation path (live output routes to the iframe engine; static output stays Tier-1).
- `view-rendering`: dispatch resolves the render tier for a `wasm` renderer, not only whether it is `wasm`.
- `wasm-capability-manifest-enforcement`: add the capability value that distinguishes interactive (Tier-2) from static (Tier-1) render output, kept in sync across `packages/api-adapter` and the `packages/graph` duplicate.

## Impact

- `apps/web`: new Tier-2 iframe render engine (frame pool, srcdoc + meta-CSP builder, nonce bridge, Zod message schemas), a worker entry that hosts `executeSandboxedGuestPlugin`, and render-resolver/registry changes to select and route by tier; Tauri config gains `withGlobalTauri: false` for untrusted webviews.
- `packages/api-adapter`: a worker-transport execution wrapper around the existing executor (the executor core is unchanged); the new render-tier capability value in `KNOWN_WASM_CAPABILITIES`.
- `packages/graph`: mirror the new capability value in the leaf-side vocabulary duplicate.
- `docs/design`: resolve canopy-7dj's `canopy:ui/render` review with the isolation model as its answer.
- No kernel data-model change; no new persisted node types beyond a possible renderer tier signal already expressible via capabilities.
