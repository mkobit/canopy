# Local-app delivery and plugin-host phasing

> Status: **decided direction** (decision bead; no code change; each phase's implementation gated on its own OpenSpec change + adversarial review)
> Scope: which clients Canopy invests in near-term, and how that sequences against the plugin runtime — which is foundational to the whole project
> Type: architecture decision record (ADR)
> Bead: `canopy-94h` (decision)
> Related: `canopy-reh` (permission-model rework), `canopy-3xr` (WIT-derived capability vocabulary), `canopy-ylr`/`canopy-a3q` (BYO-cloud `storage-drive` sync), the shipped `canopy-dr4` (WASM capability manifest enforcement)

---

## 1. Context

Canopy today ships as processes, not an installable app:

- `apps/web` — a React 19 + Vite 8 SPA that runs the whole graph stack in the browser (`GraphSession`, `storage-indexeddb`, `sql.js`) and executes plugins as jco-transpiled JS + core wasm against JS host bindings.
- `apps/daemon` (`@canopy/daemon`) — a Node/Effect process over `storage-sqlite` exposing the `canopy.v1` JSON-RPC family (including `draft.*`) over unix-socket IPC.
- `apps/cli` — an Effect CLI over the same core.
- `apps/extension` + `apps/clip-host` — an MV3 web clipper and its native-messaging bridge.

The question that spawned this ADR was "Electron vs native vs another path for a desktop/mobile app."
The answer, after scoping, is that **that question is premature.**
The near-term clients are the two that already exist — **web and CLI** — and the load-bearing concern underneath all of them is the **plugin runtime**, which is foundational to the entire project (rendering is resolved dynamically through `ViewDefinition`/`RendererDefinition` nodes referencing WASM plugins).

This ADR therefore decides two things: the **near-term client focus** (Phase 1) and the **deferred native-shell direction** (Phase 2), with the plugin host as the spine that connects them.

---

## 2. Decision drivers

In priority order:

1. **Plugins are foundational.** Whatever is built must serve, and be driven by, real plugin usage. Runtime architecture should follow from authoring actual plugins, not precede it.
2. **Invest in clients that already exist.** Web and CLI are real and shipping. Adding a GUI-shell framework now spends effort on packaging before the plugin story is proven.
3. **Keep app logic in TypeScript.** The domain, adapter, and UI stay TS across every client and phase.
4. **Don't foreclose the native/mobile future.** A later native shell and mobile client remain in view; nothing near-term should paint them into a corner.

Drivers 1 and 2 set Phase 1.
Driver 4 keeps Phase 2 documented but unbuilt.

---

## 3. The reframe: delivery is phased, plugins are the spine

The original framing treated "which shell" as the decision.
It is not.
Web and CLI already exist, and the real foundational work is the plugin host — so the decision is a **sequencing** decision, not a framework bake-off.

- **Plugins are the spine.** Every client is, from the plugin's perspective, a host that provides capability-gated imports. The capability contract shipped in `canopy-dr4` (manifest capabilities ∩ granted scopes → effective token → gated host imports) is **runtime-independent by design**. That property is what lets clients be added or swapped without a second security story.
- **Delivery is the skin.** Browser tab, CLI, and (later) a native shell are surfaces over the same core and the same plugin contract.

The correct near-term investment is to **exercise the plugin spine through real plugins on the clients that exist**, and let that usage — not speculation — shape the runtime.

---

## 4. Phase 1 (now): web + CLI, driven by real plugins

### 4.1 Web — the plugin execution environment

The web app is where plugins actually run near-term: jco-transpiled JS + core wasm in the browser, against JS host bindings, inside the browser's wasm sandbox.
This runtime exists and works.
Phase 1 hardens it **through use** rather than through speculative architecture.

### 4.2 CLI — a thin client

The CLI drives graph operations over the `canopy.v1` daemon contract and **does not execute plugins locally** near-term.
This is a deliberate scope cut: it keeps the CLI simple, avoids standing up a headless/native wasm host before there is a proven need, and leaves the browser as the single plugin runtime for now.
A headless or native plugin host is a Phase 2 concern (§5), not a Phase 1 one.

### 4.3 The near-term priority: author real plugins first

The foundational Phase 1 work is **writing and dogfooding real rendering plugins** (Markdown first, then others), not designing runtime abstractions.
Real plugins are the forcing function: they reveal what the host-binding surface actually needs, where the capability vocabulary is wrong or missing (as the `wizard` gap did during `canopy-dr4`), and what the DX of authoring a plugin is really like.
Runtime architecture — a native host, a shared conformance suite across runtimes, a richer permission model — is **deferred until real plugin usage demands it**, and then designed against evidence.

This is the same discipline applied elsewhere in the project: let battle-tested usage drive the abstraction rather than building it speculatively.

---

## 5. Phase 2 (deferred): native shell + mobile + headless/native plugin host

When Phase 1 has a proven plugin host and real plugins, a native shell and mobile client come into view.
This section is **reference, not a commitment** — it records the evaluation so a future author does not re-derive it.

### 5.1 What Tauri is (since it came up)

Tauri is a framework for building desktop and mobile apps where the UI is your existing web app rendered in the **OS's built-in webview**, and the native layer is a **small Rust program**.

- **vs Electron:** Electron bundles a full Chromium + Node per app (~100–150 MB, heavy memory). Tauri uses the webview already on the machine — WebView2 (Windows), WKWebView (macOS/iOS), WebKitGTK (Linux), Android System WebView — so bundles are single-digit MB with lower memory.
- **How it works:** the SPA runs in the webview; when it needs native powers (filesystem, notifications, spawning a process, hosting a native wasm runtime) it calls Rust-side "commands" over an IPC bridge.
- **v2:** stable since late 2024, adds iOS/Android, so one codebase targets desktop and mobile.
- **Cost:** per-OS webview differences (a cross-browser-style test surface) and a Rust shell layer.

### 5.2 Options, if and when Phase 2 is triggered

| Option          | Plugin host                                          | Mobile             | Notes                                                       |
| :-------------- | :--------------------------------------------------- | :----------------- | :---------------------------------------------------------- |
| Installable PWA | browser sandbox only                                 | partial (iOS gaps) | cheapest; can't give native FS/OS integration               |
| Electron        | native (desktop) possible                            | **none**           | desktop-only forces a second mobile stack                   |
| **Tauri v2**    | **native wasmtime (desktop) + JS fallback (mobile)** | yes                | one shell desktop+mobile; thin Rust core; leading candidate |
| Capacitor split | JS in webview everywhere                             | yes                | no native host; two frameworks                              |
| Fully native    | per-platform                                         | yes                | violates the TS-first driver                                |

If Phase 2 happens, **Tauri v2 is the leading candidate**: it is the only option that can host a native `wasmtime` Component Model plugin runtime on desktop (real fidelity, wasmtime's fuel/epoch/memory limits reinforcing the `canopy-dr4` contract) while falling back to the transpiled-JS runtime in the webview on mobile — all under the same runtime-independent capability contract, with app logic staying TS and Rust as a thin shell.
Electron is disfavored because its desktop-only nature forces a separate mobile stack.

### 5.3 What Phase 1 must preserve for Phase 2

The single thing Phase 1 must not break: **the capability contract stays runtime-independent.**
As long as host-import authority flows through the `canopy-dr4` effective-token check and not through client-specific back channels, a future native host enforces the identical contract, and Phase 2 adds a runtime rather than a second security model.

---

## 6. Adversarial review and mitigations

The near-term commitment is small (focus on existing clients + author plugins), so the risks are mostly about **not over-building**; Phase 2's heavier risks are deferred with it.

### 6.1 Resource and performance overhead

- **Risk:** authoring real plugins reveals the browser runtime is too slow or too limited for real rendering workloads.
  - _Mitigation:_ measure against real plugins before concluding anything; a genuine limit becomes the evidence that triggers a Phase 2 native host, rather than a reason to build one preemptively.

### 6.2 Failure modes and edge cases

- **Risk:** the CLI-as-thin-client cut leaves a real near-term need (e.g. headless rendering for export) unserved.
  - _Mitigation:_ such a need is exactly the signal to promote a headless plugin host; until it appears, the browser runtime covers plugin execution. The cut is reversible and cheap to revisit.
- **Risk:** deferring runtime architecture lets ad-hoc client-specific host wiring accrete.
  - _Mitigation:_ hold the §5.3 invariant (authority only through the capability contract) as a review checkpoint on any plugin-host change.

### 6.3 Security and isolation

- **Risk:** authoring plugins surfaces capability-vocabulary gaps that let a plugin do more than intended.
  - _Mitigation:_ this is a feature of the plan — usage exposes gaps (as `wizard` did); each gap is a `canopy-reh`/`canopy-3xr` input, and the manifest validation from `canopy-dr4` fails closed on unrecognized capabilities.

### 6.4 Migration and backward compatibility

- **Risk:** deferring the shell decision strands nothing, but a later Tauri adoption might tempt a core rewrite.
  - _Mitigation:_ the §5.3 invariant plus TS-first driver mean Phase 2 hosts the unchanged SPA and reuses the unchanged `canopy.v1` contract; no existing surface is deleted.

---

## 7. Consequences

- Near-term effort goes to **web + CLI + real plugins**, not to a GUI-shell framework. No Rust, no Electron/Tauri, no mobile toolchain enters the repo now.
- The **browser is the sole plugin runtime** near-term; the headless/native host is deferred until real usage demands it.
- **Plugin authoring becomes the driver** of host-binding surface, capability vocabulary, and permission-model decisions (`canopy-reh`, `canopy-3xr`), which are shaped by evidence rather than speculation.
- Phase 2 (native shell + mobile, Tauri leading) is **documented and unbuilt**; the capability contract's runtime-independence is the one invariant that keeps that door open.

## 8. Trigger signals to promote Phase 2

Start the Phase 2 (native shell / headless host) evaluation when one of these is real, not hypothetical:

- A plugin workload is measurably too slow or too constrained in the browser sandbox.
- A concrete need for headless plugin execution appears (batch export, server-side rendering, CI).
- Native filesystem access for `storage-file`/`storage-drive` becomes a blocking requirement for a real user flow.
- A mobile client moves from "someday" to committed scope.

## 9. Next steps (staged as beads, not yet implementation)

Per project rules, implementation tasks are created only after a phase's OpenSpec change passes adversarial review.
Near-term direction:

- **Author real rendering plugins** (Markdown first) and dogfood them through the web client — the Phase 1 foundational work that drives host design.
- Keep the **CLI a thin `canopy.v1` client**; no local plugin execution near-term.
- Hold **Phase 2 (native shell + mobile, Tauri candidate)** as a deferred decision, promoted only on a §8 trigger.
