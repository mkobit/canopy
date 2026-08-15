## Why

Rendering is decoupled from content storage via `ViewDefinition`/`RendererDefinition` nodes that reference WASM plugins (invariant 10).
Today that decoupling is only half real: `default-view-rendering` seeds `RendererDefinition` nodes and resolves them through the settings cascade, but every seeded renderer is `rendererKind: 'system'` whose `entryPoint` (`system:text`/`system:code`/`system:markdown`) maps to a **hardcoded native React component**.
No content is rendered by a WASM plugin.
Separately, `wasm-component-pipeline` can compile a guest into a graph-loadable plugin node, and `executeSandboxedGuestPlugin` can run one under fuel/memory/timeout/capability guards — but the only WIT world is `wizard-plugin`, there is no render interface, and the render path never invokes the executor.

Per the local-app-delivery ADR (canopy-94h), plugins are the spine of the project, and the near-term forcing function is authoring a real rendering plugin end to end (canopy-586) rather than designing runtime abstractions up front.
This change closes the gap for the static-output case: a first-party Markdown renderer that runs as a real WASM plugin through the same path a third party would use, dogfooded in `apps/web`.
The safety model for untrusted plugin output is settled in [docs/research/2026-08-14-safe-rendering-untrusted-plugin-output.md](../../../docs/research/2026-08-14-safe-rendering-untrusted-plugin-output.md): a two-tier model where static HTML renders sanitized-inline (Tier 1) and live-JS renders in a sandboxed iframe (Tier 2, deferred). Markdown is Tier 1.

## What Changes

- **Render WIT interface + world**: add a `content-rendering` interface (a `render` function taking content-node input, returning `result<html output, error>`) and a `render-plugin` world exporting `plugin-lifecycle` + `content-rendering`, alongside the existing `wizard-plugin` world.
- **First-party Markdown guest plugin**: author `apps/web/src/plugin/markdown/guest.ts` implementing lifecycle + render, declaring capability `render:raw-html`, and register it in `plugins.config.json` so the existing pipeline builds and packages it.
- **WASM render execution in the host**: extend the render resolver so a `RendererDefinition` with `rendererKind: 'wasm'` executes its plugin via `executeSandboxedGuestPlugin` (scoped to `render:raw-html`) and renders the returned HTML through a **Tier-1 sanitized-inline** path (DOMPurify + closed Declarative Shadow DOM), with the native switch retained as fallback.
- **Bundled install (replace native Markdown)**: seed the Markdown plugin node into bootstrap and switch the seeded Markdown renderer from `rendererKind: 'system'`/`entryPoint: 'system:markdown'` to `rendererKind: 'wasm'` targeting the plugin, so `MarkdownNode` resolves to the plugin through the unchanged cascade.
- **Out of scope (Tier 2)**: sandboxed-iframe rendering, the virtualized frame pool, the nonce-keyed `postMessage` bridge, and Tauri hardening are explicitly deferred to a follow-on change; `render:declarative` output is not implemented here.

## Capabilities

### New Capabilities

- `content-rendering-plugin`: resolve and execute a `rendererKind: 'wasm'` renderer as a sandboxed WASM plugin and render its untrusted static-HTML output safely inline.

### Modified Capabilities

- `view-rendering`: dispatch resolves `wasm` renderers to plugin execution rather than only native `system:*` components.
- `modular-wit`: add the `content-rendering` interface and `render-plugin` world.

## Impact

- `apps/web`: new `markdown` guest plugin + `plugins.config.json` entry; render resolver/registry gains a WASM-execution + sanitized-inline path; DOMPurify dependency.
- `packages/graph`: bootstrap seeds the Markdown plugin node and re-points the Markdown renderer to `wasm`.
- `packages/api-adapter`: consumes the existing executor/capability surface; adds the render host binding if the guest needs read access (else none).
- `wit/`: new interface and world files.
