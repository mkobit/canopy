# Design: WASM content rendering (Markdown first)

## Context

Three complete-but-unarchived changes converge here:

- `default-view-rendering` — `resolveViewDefinition` cascade, seeded `RendererDefinition`/`ViewDefinition` nodes, a React component registry, and dynamic `BlockRenderer` dispatch. All renderers are `rendererKind: 'system'` → native React.
- `wasm-component-pipeline` — `apps/web/scripts/{wit-codegen,package-plugin}.ts` build a guest (from `plugins.config.json`) into a Brotli-compressed, graph-loadable `Plugin` node.
- `wasm-capability-manifest-enforcement` / `plugin-validation` — manifest capabilities intersect granted scopes into an effective token bound into host imports.

The executor already exists: `executeSandboxedGuestPlugin(context, token, inputJson, plugin, options)` (fuel/memory/timeout/reentrancy guards, capability-validated host bindings), JSON-string in / JSON-string out (`packages/api-adapter/src/wasm/sandboxed-executor.ts`).
`RendererDefinition.rendererKind` already permits `'wasm'` (`packages/graph/src/bootstrap-definitions.ts`), and `render:raw-html`/`render:declarative` already exist in `KNOWN_WASM_CAPABILITIES`.

What is missing is only the connective tissue: a render WIT interface/world, a guest that implements it, and a resolver branch that runs a `wasm` renderer and renders its output safely.
The safety model is settled in [docs/research/2026-08-14-safe-rendering-untrusted-plugin-output.md](../../../docs/research/2026-08-14-safe-rendering-untrusted-plugin-output.md).

## Decisions

1. **Tier 1 only.** Markdown emits static HTML, so output renders via DOMPurify + closed Declarative Shadow DOM inline. The Tier-2 sandboxed-iframe engine (opaque-origin srcdoc, frame pool, nonce-keyed `postMessage` bridge, Tauri hardening) is a separate deferred change; nothing here builds toward it speculatively.
2. **Output contract = `render:raw-html`.** The render function returns an HTML string (inside a JSON envelope). `render:declarative` is left unimplemented; revisiting it is a Tier-2/constraint-path question, not this change.
3. **Real WASM execution, not the static-import fixture.** The Markdown guest runs through `executeSandboxedGuestPlugin`, unlike the mock wizard's `STATIC_PLUGINS` direct import. This is the dogfood: it exercises the host surface and will reveal capability/binding gaps (as the `wizard` gap did in canopy-dr4).
   Scope-honesty (per adversarial review): the in-browser jco-transpiled path gives WebAssembly **memory/global isolation** but **not terminable execution** (see the synchronous-runaway finding below), so what this change dogfoods is the capability/binding wiring and output-sanitization path — **not** a complete untrusted-third-party execution boundary. That is acceptable because the Markdown plugin is first-party/trusted; true untrusted execution (worker-based termination or a native wasmtime runtime) is deferred with the rest of Tier 2.
4. **Replace the native Markdown renderer.** Bootstrap re-points the seeded Markdown renderer to `rendererKind: 'wasm'`. First-party goes through the exact path a third party uses; the native `system:markdown` component remains only as the resolution/execution-failure fallback, not as the default.
5. **Read-only, minimal capability.** The Markdown plugin needs no graph reads to render its own node's content; its manifest declares `render:raw-html` and nothing else. Host binding surface added only if a concrete need appears.

## Integration points

- **WIT** (`apps/web/wit/`): new `content-rendering.wit` interface + `render-plugin` world; regenerate guest types via `wit-codegen.ts`.
- **Guest** (`apps/web/src/plugin/markdown/guest.ts`): lifecycle (`getManifest`/`initialize`/`shutdown`) + `render(input) -> result<output, string>`; entry in `plugins.config.json` with `world: "render-plugin"`.
- **Host resolver** (`apps/web/src/components/renderers/block-renderer.tsx` + `registry`): when the resolved renderer is `rendererKind: 'wasm'`, decode the `Plugin` node's `wasm_binary`, run the transpiled guest through the executor with a `render:raw-html` token, then hand the returned HTML to a new Tier-1 `SanitizedHtmlRenderer` (DOMPurify + closed shadow root).
- **Async two-phase render** (per adversarial review): plugin execution is a `Promise`, but `resolveDynamicContent` returns a `ReactNode` synchronously. The `wasm` branch cannot execute inline; it dispatches execution in an effect, holds `{ pending | ok(html) | error }` in state, renders a placeholder/native-fallback while pending, and swaps in the sanitized output on resolve. Execution must be keyed and cancellable so a node whose content changes mid-flight does not mount stale output.
- **Bootstrap** (`packages/graph/src/bootstrap-definitions.ts`): seed the Markdown `Plugin` node; switch `system:renderer:markdown` to `rendererKind: 'wasm'`.

## Adversarial review and mitigations

### Resource and performance overhead

- **Per-render WASM execution cost.** Running a component per Markdown block is far heavier than a native React render, and a document has hundreds of blocks.
  _Mitigation:_ memoize render output in a **bounded (LRU) cache** keyed by (node id, content hash) — a content hash rather than a global `Graph.revision`, so an edit to one block does not invalidate every block's cache, and the cache cannot grow unbounded across a long session; instantiate the guest once and reuse it across calls rather than per block; keep the existing fuel/memory/timeout bounds (`DEFAULT_WASM_*`) as ceilings on host-import work. Add a rendering benchmark (mirroring the existing storage/queries benchmarks) so the per-block cost is measured, not assumed.
- **Bundle weight.** DOMPurify plus the transpiled guest add to the web bundle.
  _Mitigation:_ DOMPurify is a single well-scoped dependency; the guest is Brotli-compressed in the graph node, already the pipeline's design.
  Caveat (per adversarial review): DOMPurify is a **security-critical** dependency and Tier-1's entire XSS defense — the minimum-release-age policy must not pin a version with a known sanitizer-bypass. Choose the newest policy-eligible version, confirm no open bypass advisory against it, and treat a bypass advisory as grounds for the age-policy exception the project reserves for exactly this case.
- **Shadow-root proliferation.** A closed shadow root per rendered block has non-zero cost.
  _Mitigation:_ acceptable at Tier 1 (native DOM, no frame overhead); revisit only if the benchmark shows a problem.

### Failure modes and edge cases

- **Malformed / non-conforming plugin output.** Output that is not valid JSON, missing the HTML field, or wrong-typed.
  _Mitigation:_ validate the output envelope with a Zod schema at the host boundary; on failure, fall back to the native renderer and surface a non-fatal error — never mount unvalidated output.
- **Runaway or hanging guest (corrected by adversarial review).** The executor bounds execution with `Promise.race` + `setTimeout`, but that only fires if the guest **yields**. A guest whose exported render function runs a _synchronous_ loop blocks the main thread, the timer never fires, and the tab hangs — the timeout does **not** save us here. The fuel meter also only accounts host-import calls, so pure-compute loops evade it.
  _Mitigation:_ for Change A the Markdown guest is first-party and trusted, so this is a bug-risk, not an attack surface; it is an **accepted risk** documented as such. Terminable execution for _untrusted_ guests requires running the guest in a Web Worker (which the host can `terminate()` on timeout) or a native wasmtime runtime — filed as a follow-up (see "Residual accepted risks" below) and bundled into the Tier-2 work, not built here. Change A additionally caps input size (`memoryChecker`) to shrink the pathological-input surface.
- **Stale/racing async render.** Content changes while a plugin render is in flight, or a slow render resolves after the node has been replaced.
  _Mitigation:_ execution is keyed by (node id, content hash) and cancelled/ignored on key change; a late result for a superseded key is discarded, never mounted.
- **Browser execution of the transpiled guest (new integration surface).** This is the _first_ use of `executeSandboxedGuestPlugin` on the web render path; jco-transpiled output has historically needed Node-binding shims (`process.binding(...)`), which differ in the browser.
  _Mitigation:_ prove guest instantiation in a real browser via the existing Playwright e2e (not just Bun unit tests, which import `guest.js` directly per AGENTS.md); any required shim is added to the transpiled-shim ignore list, not worked around ad hoc.
- **Decode failure of `wasm_binary`.** Corrupt/absent base64 or Brotli payload.
  _Mitigation:_ treated as resolution failure → native fallback; logged once, not per frame.
- **Cycle / recursion.** Plugin-rendered content that recurses.
  _Mitigation:_ `BlockRenderer` already carries `visited`-set cycle protection; the WASM path reuses it and does not delegate child rendering back into a plugin without it.

### Security and isolation

- **Untrusted HTML injection (XSS/mXSS).** Raw plugin HTML reaching the host DOM.
  _Mitigation:_ DOMPurify with `SANITIZE_DOM` + `SANITIZE_NAMED_PROPS` strips scripts and event-handler attributes; output is never inserted via `innerHTML` on a host element outside the shadow root. The Logseq escape (host applying plugin-supplied DOM attributes) is structurally excluded because the host never reads DOM attributes from plugin output.
  Correction (per adversarial review): the closed Declarative Shadow DOM is **not** part of this XSS defense. Shadow DOM encapsulates CSS and the DOM tree, **not** script execution — a handler or `<script>` that survives sanitization runs in the host's JS realm regardless of the shadow root. So Tier-1's XSS safety rests **entirely** on DOMPurify (hence the security-critical-dependency caveat above), and a DOMPurify bypass is a full host XSS. This residual is **accepted for Tier 1** precisely because real origin isolation is what Tier 2 (sandboxed iframe) exists to provide; renderers that cannot accept this residual must be Tier 2.
- **CSS-based attacks (overlay/clickjacking, selector exfiltration).** Inline styles enabling full-viewport overlays or attribute-selector data leaks.
  _Mitigation:_ here the closed shadow root **does** help — it contains plugin CSS to the block and prevents host-CSS bleed; additionally constrain/strip positioning and external `url()` in sanitized CSS. Documented as a Tier-1 limitation, with the Tier-2 iframe as the escalation for renderers that need arbitrary CSS.
- **Capability over-grant.** A plugin acquiring more than render authority.
  _Mitigation:_ effective token is `intersect(manifest, granted)` and capped at `render:raw-html`; the Markdown manifest declares nothing else; execution uses the existing capability-validated host bindings, so any host import beyond the grant is rejected.
- **Live JS via Tier 1.** A plugin trying to smuggle executable script through the static path.
  _Mitigation:_ Tier 1 strips scripts by construction; live-JS renderers are a Tier-2 capability that this change does not enable, so there is no inline-script path to smuggle through.

### Migration and backward compatibility

- **Replacing the native Markdown renderer.** Existing graphs already have a `system:markdown` renderer node.
  _Mitigation:_ pre-release, no real vaults exist (per project status), so bootstrap can change the seeded renderer directly; the native component is retained purely as the failure fallback, so a missing/failed plugin degrades to today's behavior rather than breaking rendering.
- **Pipeline/config coupling.** Adding a second world to `plugins.config.json` must not break the wizard build.
  _Mitigation:_ the pipeline already iterates per-plugin with a per-plugin `world`; the Markdown entry is additive.
- **Spec drift.** `view-rendering` and `modular-wit` specs change.
  _Mitigation:_ deltas are included here; specs sync on archive, consistent with prior changes.

## Residual accepted risks (from adversarial review)

These survive the review as deliberately accepted for Change A because the Markdown plugin is first-party/trusted and the alternatives belong to Tier 2. Each has a follow-up to file **after this design is approved** (task/implementation beads only post-approval, per project rules):

- **No terminable execution.** A synchronous runaway guest hangs the main thread. Accepted for first-party; worker/native-runtime termination is a prerequisite before any _untrusted third-party_ rendering plugin ships. Follow-up bead → fold into the Tier-2/Change B scope.
- **DOMPurify-sole XSS defense.** A sanitizer bypass is a full host XSS at Tier 1. Accepted; Tier 2 origin isolation is the answer for renderers that cannot accept it.

## Resolved decisions (were open questions; settled at the approval gate)

- **Render input = raw properties JSON.** The plugin receives the target node's raw properties JSON, not a narrowed content projection, to keep the host binding surface minimal. A narrowed projection is deferred until a concrete renderer needs it.
- **DOMPurify CSS policy = strip positioning + external `url()`; decide the remainder against real output.** The sanitizer strips positioning (`position`, `z-index`) and external `url()` references at minimum; whether to allow a safe subset of remaining inline style is decided against the concrete Markdown output during implementation, not in the abstract.
- **`SanitizedHtmlRenderer` lives in `apps/web` only.** No shared sanitize-contract package now (YAGNI); the eventual Tier-2 change hoists a shared contract when it actually exists.
- **Capability grant source = implicit system render-grant constant.** For a bundled/first-party system plugin, the render path supplies a fixed host-side render grant constant that `intersectCapabilities(manifest, granted)` narrows against the manifest (capped at `render:raw-html`). Explicit graph-stored grants are deferred until a third-party install flow exists.
