# Safely rendering untrusted plugin HTML output

> Type: research / architecture decision input
> Date: 2026-08-14
> Status: frozen snapshot
> Purpose: decide how Canopy renders the HTML a rendering plugin emits without trusting it, and scope what the first Markdown plugin (canopy-586) must build versus what is deferred

---

## Context

Rendering plugins are WebAssembly components (invariant 10, `AGENTS.md`).
WASM already sandboxes plugin _execution_; the open problem is safely _rendering the output a plugin returns_, which must be treated as untrusted.
The render output contract is a raw HTML string for now (decided with the maintainer 2026-08-13), so this document is about how to render that string safely, not about whether the contract should instead be a constrained AST.

Two constraints shape every answer:

- Canopy is a local-first web SPA today (Vite/React) with a native shell (Tauri v2) planned later ([local-app-delivery ADR](../design/2026-08-13-local-app-delivery.md)); it is frequently fully offline with no server and no second origin.
- Content is a recursive tree of blocks; a document can be hundreds of blocks, each potentially plugin-rendered, rendered inline in the block tree (`apps/web/src/components/renderers/block-renderer.tsx`).

## Two philosophies

There are two ways to make rendering untrusted output safe, and they are opposites.

1. **Constraint** — the plugin returns a structured tree against an allowlisted component catalog; raw HTML never exists, so there is nothing to sanitize.
   This is [vercel-labs/json-render](https://github.com/vercel-labs/json-render): Zod-validated props, enumerated actions, no `eval`, "the JSON itself is the security boundary".
   Safe by construction; expressiveness is capped at the host catalog.
   This is the `render:declarative` capability already in the vocabulary.
2. **Isolation** — the plugin returns arbitrary HTML/JS; the host renders it walled off so even malicious output cannot reach the host.
   This is the sandboxed-iframe family, and it is what "raw HTML" commits us to for anything with live scripts.
   This is the `render:raw-html` capability already in the vocabulary.

`render:declarative` and `render:raw-html` already exist in `KNOWN_WASM_CAPABILITIES` (`packages/api-adapter/src/wasm/capabilities.ts`), so the vocabulary anticipated both philosophies before this research.

## Decision: a two-tier model

The output need decides the tier, and the tier decides the safety mechanism.

- **Tier 1 — sanitized static inline (default).**
  For output that is static HTML with no scripts (Markdown, formatted text, layout).
  Sanitize with DOMPurify (`SANITIZE_DOM`, `SANITIZE_NAMED_PROPS`) and mount inside a **closed Declarative Shadow DOM** root for CSS and DOM-clobbering containment.
  Native rendering performance, cross-block text selection, and a continuous accessibility tree.
  No iframe, no origin gymnastics.
- **Tier 2 — sandboxed iframe (opt-in, deferred).**
  For output that needs live JS or an interactive WASM visualizer.
  A sandboxed `srcdoc` iframe with strict isolation (below).
  Materially more expensive and only earns its cost when Tier 1 cannot express the renderer.

**A Markdown renderer is Tier 1.**
It emits static HTML, so it renders via sanitize-inline and never touches an iframe.
This is why the scary part of this research — opaque origins, the offline foreign-origin problem, the frame pool, Tauri hardening — is entirely Tier 2 and out of scope for the first plugin.

This mirrors the research's own recommendation: constraint/static as the default, isolation as an escape hatch reached only on demand.
It also matches the project principle of not building runtime abstractions until real usage demands them ([constrain speculative design]; canopy-586's own framing).

## Tier 1 failure modes to guard (DOMPurify is not a free pass)

Per the deep-research report, sanitize-inline still has sharp edges the design must close:

- **Mutation XSS (mXSS)** — clean HTML mutating into script on DOM insertion via parser namespace transitions (SVG/MathML in HTML); mitigated by modern DOMPurify `<template>` parsing but must not be defeated by post-sanitize string manipulation.
- **CSS injection** — inline `style`/`<style>` enable full-viewport overlay/clickjacking (`position:fixed;z-index:99999`) and attribute-selector data exfiltration (`input[value^="a"]{background:url(...)}`); a closed Declarative Shadow DOM contains layout leakage, and CSS should be constrained.
- **DOM clobbering** — injected `id`/`name` shadowing host globals; mitigated by `SANITIZE_NAMED_PROPS` (rewrites to a `user-content-` namespace).

## Tier 2 design (recorded for the deferred change, not built now)

Recommended when Tier 2 is eventually needed:

- **Isolation boundary:** `srcdoc` iframe, `sandbox="allow-scripts"` with `allow-same-origin` **omitted** (omitting it forces an opaque null origin; combining the two lets the frame delete its own sandbox and escape).
  CSP is delivered via a `<meta http-equiv>` tag _inside_ the srcdoc, because srcdoc inherits the parent CSP otherwise.
- **Offline foreign-origin problem:** `srcdoc` opaque origin works fully offline with zero network dependency; `blob:`/`data:`/service-worker-synthetic-origin each trade away offline reliability, storage, or add lifecycle/registration cost.
  `allow-unique-origin` (the W3C proposal that would give server-free unique origins _with_ storage) is unimplemented across engines as of 2026, so opaque-origin frames must be assumed to have no storage APIs.
- **Granularity:** never per-block (per the report, ~2–5 MB/frame → >1.5 GB at 300 blocks, plus broken cross-frame selection and a screen-reader region per block).
  Use a virtualized recycled pool (~10–15 active frames in-viewport), static previews off-screen.
- **Host↔frame bridge:** opaque-origin frames all report `event.origin === "null"`, so the host assigns each frame a cryptographic `instanceNonce` and keys messages by it; messages are validated against strict Zod schemas (`additionalProperties:false`, drop on mismatch), dispatched indirectly (never set host DOM attributes — that is exactly the Logseq escape below), and rate-limited.
- **Tauri:** set `withGlobalTauri: false` so the `window.__TAURI__` IPC bridge is never injected into untrusted webviews; gate native access behind capability manifests.

### Hardened Tier-2 CSP (reference)

```
default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline';
img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none';
worker-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'; navigate-to 'none';
```

Sandbox flags `allow-forms`, `allow-modals`, `allow-popups`, `allow-top-navigation` are all omitted; `connect-src 'none'` closes network exfiltration.

## Prior art

Per the deep-research report (specific CVE identifiers and campaign names below are **from that report and not independently verified here** — verify before citing as fact, per [audit upstream phrasing]):

- **Obsidian** — plugins run in the privileged Electron/Node context, no sandbox; the cautionary extreme (RCE via malicious plugins).
- **Logseq** — sandboxed iframes, but the host applied plugin-supplied DOM attributes directly, enabling a sandbox escape (report cites CVE-2026-47901).
  This is the concrete reason Canopy's bridge must never set host DOM attributes from frame messages.
- **Notion** — third-party embeds isolated on a separate embed origin.
- **Observable** — untrusted notebook code on a dedicated user-content subdomain with worker iframes.
- **Val Town** — QuickJS-compiled-to-WASM for server-side isolation; sandboxed iframes for client previews.
- **Figma** ([Figma blog](https://www.figma.com/blog/an-update-on-plugin-security/), [madebyevan](https://madebyevan.com/figma/an-update-on-plugin-security/)) — abandoned the Realms shim (object-confusion vulns) for QuickJS-in-WASM; untrusted UI in an iframe, document access in the VM.
- **VS Code webviews** ([docs](https://code.visualstudio.com/api/extension-guides/webview)) — the canonical host model: `default-src 'none'` CSP with nonces, `asWebviewUri`/`localResourceRoots`, private `acquireVsCodeApi()`, message-passing only.

## What this means for canopy-586 (scope split)

- **Change A (now):** render WIT interface + `render-plugin` world; a first-party Markdown guest plugin built through the existing `wasm-component-pipeline`; the render resolver executes a `rendererKind: 'wasm'` plugin via `executeSandboxedGuestPlugin` and renders the returned HTML **Tier 1** (DOMPurify + closed shadow DOM); the seeded Markdown renderer switches from native `system:markdown` to the plugin.
  Tier 2 is explicitly excluded.
- **Change B (deferred):** the Tier-2 sandboxed-iframe engine (opaque-origin srcdoc, virtualized frame pool, nonce-keyed Zod bridge, Tauri hardening), built only when a renderer that needs live JS actually exists.
  This document is its design input, and it is where canopy-7dj's `canopy:ui/render` HTML-output review lands.

## Sources

- Gemini deep-research report (maintainer-provided, 2026-08-14), archived context for this doc.
- [vercel-labs/json-render](https://github.com/vercel-labs/json-render)
- [VS Code webviews](https://code.visualstudio.com/api/extension-guides/webview)
- [Figma plugin security update](https://www.figma.com/blog/an-update-on-plugin-security/) · [madebyevan writeup](https://madebyevan.com/figma/an-update-on-plugin-security/)
- [web.dev: sandboxed iframes](https://web.dev/articles/sandboxed-iframes)
- [One-way sandboxed iframes (Joshua Rogers)](https://joshua.hu/rendering-sandboxing-arbitrary-html-content-iframe-interacting)
- [allow-unique-origin proposal](https://github.com/shhnjk/allow-unique-origin)
