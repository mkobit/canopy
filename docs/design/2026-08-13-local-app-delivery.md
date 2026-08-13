# Local-app delivery: Electron vs native vs another path

> Status: **proposed direction** (decision bead; no code change; implementation gated on a follow-up OpenSpec change + adversarial review)
> Scope: how Canopy is delivered as a local application on each platform, given a near-term mobile target and a plugin system that must be first-class in whatever model is chosen
> Type: architecture decision record (ADR)
> Bead: `canopy-94h` (decision)
> Related: `canopy-reh` (permission-model rework), `canopy-3xr` (WIT-derived capability vocabulary), `canopy-ylr`/`canopy-a3q` (BYO-cloud `storage-drive` sync), the shipped `canopy-dr4` (WASM capability manifest enforcement)

---

## 1. Context

Canopy today ships as a set of processes, not an installable app:

- `apps/web` — a React 19 + Vite 8 single-page app that runs the whole graph stack in the browser (projection, `GraphSession`, `storage-indexeddb`, `sql.js`) and executes plugins as jco-transpiled JS + core wasm against JS host bindings.
- `apps/daemon` (`@canopy/daemon`) — a Node/Effect process that runs the same graph stack over `storage-sqlite` and exposes the `canopy.v1` JSON-RPC family (including `draft.*`) over a unix-socket IPC.
- `apps/cli` — an Effect CLI over the same core.
- `apps/extension` + `apps/clip-host` — an MV3 web clipper and its native-messaging bridge.

There is no desktop or mobile application.
Users either open a browser tab (web app, browser-sandboxed storage) or run the daemon from a terminal.

This ADR decides the delivery model.
It is prompted by four converging pressures, all confirmed as in-scope drivers (see §2): a near-term mobile client, the desire for a real WASM plugin host rather than only the browser sandbox, native filesystem access for the file/drive storage backends, and installable/offline distribution with OS integration.

The load-bearing constraint, surfaced explicitly during scoping, is **plugins**.
Canopy's architecture is plugin-centric: rendering (Markdown/rST/HTML/custom) is resolved dynamically through `ViewDefinition`/`RendererDefinition` nodes that reference WASM Component Model plugins, and `canopy-dr4` just landed capability-manifest enforcement for those plugins.
Whatever delivery model is chosen is therefore also a choice of **plugin runtime and isolation boundary**.
An option that hosts plugins poorly is disqualifying regardless of how good its packaging or OS integration is.

---

## 2. Decision drivers

In priority order, with the scoping answers folded in:

1. **Plugin host quality.** The delivery model must host WASM Component Model plugins with strong isolation, acceptable performance, and a capability-enforcement boundary at least as tight as the manifest/token model shipped in `canopy-dr4`. Preference stated: a **native wasm host where available**, with a transpiled-JS fallback where it is not.
2. **Mobile is near-term.** iOS and Android are real targets, not someday. This is decisive: it removes any desktop-only framework from contention as the _primary_ model.
3. **Local filesystem access.** Native FS for `storage-file` and the planned `storage-drive` (BYO-cloud folder sync, `canopy-ylr`/`canopy-a3q`) without the browser File System Access API's platform gaps.
4. **OS integration.** Tray, global hotkeys, native notifications, launch-at-login, deep links.
5. **Offline + distribution.** Installable, offline-first, auto-updating; escape IndexedDB/`sql.js` quotas by running the real graph stack locally.
6. **Keep app logic in TypeScript.** A **thin native shell is acceptable** (a small, mostly-generated Rust core is fine) but the domain, adapter, and UI stay TS. This rules out rewriting the kernel per platform.

Driver 2 alone eliminates Electron as the primary model.
Drivers 1 and 6 together point at a framework with a native core capable of hosting `wasmtime`, but whose application surface stays TS/web — which is the Tauri profile.

---

## 3. Options considered

### Option A — Stay web-only (installable PWA)

Ship the existing SPA as an installable PWA: service-worker offline, web-app-manifest install, IndexedDB/`sql.js` storage.

- **Plugins:** transpiled-JS in the browser sandbox only. No native host.
- **Mobile:** works, but iOS Safari PWAs have real limits (no File System Access API, storage eviction, no background sync, no push parity).
- **FS/OS:** File System Access API is Chromium-desktop-only; no tray/hotkeys/notifications parity.
- **Verdict:** the cheapest path and a fine _fallback runtime_, but it cannot satisfy drivers 1, 3, or 4. Not a primary model.

### Option B — Electron

Chromium + Node desktop shell hosting the web UI, with the daemon logic in-process or as the Node main process.

- **Plugins:** runs transpiled-JS today; could host `wasmtime` via a Node native addon for a native path.
- **Mobile:** **none.** Electron is desktop-only.
- **FS/OS:** excellent.
- **Cost:** large bundle (~100–150 MB), heavy memory (full Chromium per app), all-TS (fits driver 6).
- **Verdict:** strong on desktop, but driver 2 (mobile near-term) is fatal. Choosing Electron means committing to a _second, unrelated_ mobile stack later — the exact fragmentation this decision exists to avoid.

### Option C — Tauri v2 (recommended)

System-webview UI (WebView2 / WKWebView / Android System WebView) with a small Rust core, one codebase targeting desktop **and** iOS/Android (Tauri v2's mobile support is stable).

- **Plugins:** the Rust core can host `wasmtime` with **first-class Component Model support** on desktop — the plugin runs as a real component, not a transpiled shim, with wasmtime's own fuel/epoch/memory limits reinforcing the capability model. On mobile, where ahead-of-time/JIT wasm execution is constrained by the platform, plugins fall back to the transpiled-JS path already used by the web app. This is exactly the "native where available, fallback where not" posture requested.
- **Mobile:** first-class, same codebase.
- **FS/OS:** native FS, tray, notifications, deep links, global shortcuts via Tauri plugins.
- **Cost:** introduces Rust as a **thin, mostly-generated shell** (fits driver 6); smaller bundle and lower memory than Electron (system webview, no bundled Chromium); the Rust↔JS host-binding bridge is the main new engineering surface.
- **Verdict:** the only option that satisfies drivers 1–6 simultaneously. Recommended.

### Option D — Capacitor (mobile) + web/Electron (desktop) split

Capacitor wraps the web app for iOS/Android; desktop stays PWA or Electron.

- **Plugins:** transpiled-JS in the webview on every target. No native host anywhere.
- **Verdict:** satisfies mobile and distribution, but gives up driver 1's native host entirely and splits the shell across two frameworks. Strictly dominated by Tauri for this driver set.

### Option E — Fully native per platform

Swift/Kotlin/native UI per OS over the TS core compiled/bridged in.

- **Verdict:** violates driver 6 (thin shell, TS logic) and multiplies maintenance across platforms. Rejected without deep evaluation; revisit only if webview performance for the editor becomes disqualifying.

---

## 4. The plugin-host axis (the differentiator)

Because plugins are the load-bearing constraint, the options separate primarily on _how they run a WASM Component Model plugin_, not on packaging.

Two runtimes are in play:

- **Transpiled-JS (jco):** the component is transpiled to JavaScript plus core wasm modules and executed in the webview against JS host bindings. This is what the web app does today. It runs anywhere a modern webview runs — including iOS WKWebView — and inherits the browser's wasm sandbox. It is the correct **fallback** and the correct **mobile** runtime.
- **Native `wasmtime`:** the component runs in a Rust-hosted wasmtime instance with real Component Model fidelity, wasmtime's resource limits (fuel, epochs, memory), and a host-binding surface implemented in Rust that calls back into the graph stack. Available on desktop; constrained on iOS by the platform's JIT restrictions, so not the mobile default.

The capability model shipped in `canopy-dr4` maps cleanly onto both: the manifest-declared capabilities intersect with granted session scopes to mint an effective token, and that token gates host imports. In the transpiled-JS path the check is the existing `verifyCapability` on JS host bindings; in the native path the same intersection result is enforced at the wasmtime host-function boundary. **The capability contract is runtime-independent**, which is what makes a dual-runtime model tenable rather than two divergent security stories.

This axis is why Tauri wins: it is the only option that can offer the native runtime on desktop _and_ the transpiled fallback on mobile within one shell, keeping the capability contract identical across both.

The main new work this creates is the **host-binding bridge**: today host imports are JS functions closing over an `ApiAdapterContext`. A native wasmtime host needs those same operations reachable from Rust. The cleanest design keeps the graph/adapter authority in one place (a local JSON-RPC/`canopy.v1` surface the Rust host calls) rather than reimplementing adapter logic in Rust — reusing the daemon contract that already exists.

---

## 5. Comparison

| Driver                    | A: PWA                | B: Electron      | C: Tauri v2                      | D: Capacitor split |
| :------------------------ | :-------------------- | :--------------- | :------------------------------- | :----------------- |
| 1. Plugin host quality    | sandbox only          | native (desktop) | **native desktop + JS fallback** | sandbox only       |
| 2. Mobile near-term       | partial (iOS gaps)    | none             | **yes**                          | yes                |
| 3. Local FS               | Chromium-desktop only | yes              | **yes**                          | limited            |
| 4. OS integration         | minimal               | yes              | **yes**                          | partial            |
| 5. Offline + distribution | yes (weak on iOS)     | yes (desktop)    | **yes**                          | yes                |
| 6. Thin shell, TS logic   | all-TS                | all-TS           | **thin Rust shell**              | all-TS             |

Tauri is the only column without a disqualifying cell against this driver set.

---

## 6. Decision and verdict

**Adopt Tauri v2 as the primary local-app delivery model**, with:

1. **One shell, all targets** — desktop (Windows/macOS/Linux) and mobile (iOS/Android) from a single Tauri v2 project hosting the existing web UI.
2. **Dual plugin runtime under one capability contract** — native `wasmtime` Component Model host on desktop; jco-transpiled-JS fallback in the webview on mobile and as the universal fallback. The `canopy-dr4` capability model is the shared enforcement contract across both.
3. **Reuse, don't rewrite, the core** — the graph/adapter/storage stack stays TypeScript. Desktop reuses the `canopy.v1` daemon contract as the host-binding backend (Tauri sidecar or embedded runtime); the Rust core stays a thin shell plus the wasmtime host bridge.
4. **Mobile runs the in-webview stack** — since Node cannot run on iOS/Android, mobile uses the same in-browser graph stack the web app already runs (`storage-indexeddb` or a mobile-SQLite Tauri plugin), not the Node daemon.
5. **The web app remains a first-class target** — Tauri hosts the same SPA; the hosted web build (and its PWA affordances) is retained for zero-install and BYO-cloud (`storage-drive`) use.

Electron is explicitly **not** chosen: its desktop-only nature forces a second mobile stack, and its only advantage (all-TS, mature) is matched by Tauri's thin-shell profile.

---

## 7. Architecture sketch

```
                 ┌──────────────────────────────────────────┐
                 │            Tauri v2 shell                 │
                 │  (Rust core — thin; per-OS webview)       │
                 │                                            │
   webview  ───► │  apps/web SPA (React) ── plugins:          │
   (all         │     ├─ mobile: jco transpiled-JS host       │
    targets)    │     └─ desktop: → native wasmtime host ──┐  │
                 │                                          │  │
                 │  Rust: wasmtime Component Model host  ◄──┘  │
                 │     host imports → canopy.v1 backend        │
                 └───────────────┬────────────────────────────┘
                                 │
              desktop            │            mobile
      ┌──────────────────────────┴───────────────────────┐
      │                                                    │
  Node/Bun daemon sidecar                        in-webview TS stack
  (@canopy/daemon, storage-sqlite,               (graph + storage-indexeddb
   canopy.v1 JSON-RPC)                            or mobile-SQLite plugin)
```

The invariant this preserves: **there is exactly one capability-enforcement contract and one graph/adapter implementation**, in TypeScript. Rust exists only to (a) be the OS shell and (b) host wasmtime on desktop, calling back into the TS-defined `canopy.v1` operations for anything authority-bearing.

---

## 8. Adversarial review and mitigations

Per project policy, a design proposal must analyze resource/performance overhead, failure modes/edge cases, security/isolation, and migration/backward-compatibility risk, with a concrete mitigation for each.

### 8.1 Resource and performance overhead

- **Two plugin runtimes to maintain (JS + wasmtime).**
  - _Risk:_ divergence in behavior or capability enforcement between the transpiled-JS path and the native path; double the plugin-integration test surface.
  - _Mitigation:_ make the capability contract (`canopy-dr4` intersection + token) the single conformance target; run the _same_ plugin conformance suite against both runtimes so any divergence fails CI. The native path is additive — the JS path already exists and remains the fallback, so the native host can land behind a flag without blocking delivery.
- **Rust↔JS bridge marshalling cost.**
  - _Risk:_ per-host-call serialization across the FFI boundary adds latency to plugin host imports.
  - _Mitigation:_ host imports already marshal JSON strings (`payload-json`) at the WIT boundary, so the wire format is unchanged; reuse the existing `canopy.v1` JSON-RPC contract rather than inventing a second one. Measure host-import round-trip against the web-app baseline before gating anything on it (per the project's "measure before gating" discipline).
- **Webview editor performance vs Electron's bundled Chromium.**
  - _Risk:_ WebView2/WKWebView/WebKitGTK behavioral differences degrade the block editor.
  - _Mitigation:_ the editor already targets standards-based web APIs (it runs in ordinary browsers today); add per-webview e2e smoke coverage. This is a known, bounded compatibility surface, not an open-ended one.

### 8.2 Failure modes and edge cases

- **No Node on mobile.**
  - _Risk:_ any desktop design that assumes the daemon sidecar breaks on iOS/Android.
  - _Mitigation:_ the decision explicitly runs the in-webview TS stack on mobile (already proven by the web app); the daemon is a desktop-only optimization, not a correctness dependency.
- **wasmtime JIT restrictions on iOS.**
  - _Risk:_ assuming a native host on mobile fails at runtime under iOS's no-JIT policy.
  - _Mitigation:_ mobile is defined up front as transpiled-JS-only; the native host is desktop-scoped. If a future wasmtime interpreter/AOT path makes iOS viable, it is an additive upgrade, not a required milestone.
- **Sidecar lifecycle (crash/restart/orphan).**
  - _Risk:_ the daemon sidecar dies or is orphaned, leaving the UI without a backend.
  - _Mitigation:_ Tauri manages sidecar lifecycle; the UI already speaks a request/response IPC that can reconnect, and the in-webview stack is a viable degraded mode.

### 8.3 Security and isolation

- **Native host widens the trust boundary.**
  - _Risk:_ a wasmtime host bug or an over-broad host import escapes the sandbox that the browser previously provided for free.
  - _Mitigation:_ wasmtime is a memory-safe, capability-oriented runtime with explicit resource limits (fuel, epochs, memory) that _reinforce_ the `canopy-dr4` model; host imports remain the only authority path and are gated by the same effective-capability token. Enumerate the host-import surface as the audited trust boundary, exactly as the web path already does.
- **Tauri IPC allowlist.**
  - _Risk:_ Tauri commands exposed to the webview become an injection surface (mirrors the MV3/native-messaging bugs found in the clip-host work).
  - _Mitigation:_ minimal Tauri command allowlist; the webview reaches graph authority only through the capability-gated `canopy.v1` surface, never through ad-hoc Rust commands.

### 8.4 Migration and backward compatibility

- **Existing web app and daemon must keep working.**
  - _Risk:_ a Tauri commitment strands the current SPA or the daemon IPC consumers (CLI, extension/clip-host).
  - _Mitigation:_ Tauri _hosts_ the unchanged SPA and _reuses_ the unchanged `canopy.v1` contract; the web build, CLI, and extension continue to ship. Nothing about this decision requires deleting an existing surface.
- **Pre-release freedom.**
  - _Risk:_ over-investing before validating the webview/plugin path.
  - _Mitigation:_ no real users/vaults exist yet, so the recommended first step is a throwaway spike (§10), not a production commitment.

---

## 9. Consequences

- Introduces Rust to the repo, scoped to the shell and the wasmtime host bridge. CI gains a Rust toolchain and cross-compilation for mobile targets.
- Establishes a **dual plugin runtime** as an accepted, permanent shape (native desktop + JS fallback) rather than a temporary state — with a single capability contract as the thing that keeps it coherent.
- Makes the `canopy.v1` daemon contract the **host-binding backend**, raising its importance and coupling it to the plugin host; reinforces keeping that API narrow (per the "small APIs enable agentic refactors" preference).
- Retains the hosted web app and PWA affordances, so the BYO-cloud/`storage-drive` sync story (`canopy-ylr`) is unaffected.
- Defers, but does not resolve, the permission-model rework (`canopy-reh`) and WIT-derived vocabulary (`canopy-3xr`); the native host makes both _more_ valuable because the capability contract now spans two runtimes.

## 10. Trigger signals and open questions

Revisit or adjust if:

- Webview editor performance on any target proves disqualifying → reconsider Electron for desktop (accepting the mobile split) or a native editor surface.
- The Rust↔JS host bridge measures as a real bottleneck for plugin-heavy rendering → consider embedding more of the adapter in Rust (at the cost of driver 6).
- A wasmtime iOS execution path matures → promote the native host to mobile.

Open questions for the implementing OpenSpec change:

1. Desktop backend: daemon **sidecar** (spawn the existing Node/Bun binary) vs an **embedded** JS runtime in the Tauri process. Sidecar is lower-risk first.
2. Mobile storage: `storage-indexeddb` (exists) vs a mobile-SQLite Tauri plugin (better, more work).
3. Where the wasmtime host bindings source their authority: reuse `canopy.v1` over local IPC (recommended) vs a new in-process FFI contract.

## 11. Next steps (not yet staged)

Per project rules, no implementation tasks or beads are created until this direction and its adversarial review are approved. On approval, the likely follow-ups are:

- A **spike bead**: a throwaway Tauri v2 project hosting the existing SPA on one desktop OS + one mobile OS, running one plugin via the transpiled-JS path, to validate the webview + packaging + host-bridge assumptions before any OpenSpec change.
- An **OpenSpec change** for the native wasmtime host + host-binding bridge, sequenced after the spike, carrying its own adversarial review.
- Coordination with `canopy-reh`/`canopy-3xr` so the capability contract is defined once and enforced identically in both runtimes.
