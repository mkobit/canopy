## 1. Render WIT interface and world

- [ ] 1.1 Add `apps/web/wit/content-rendering.wit`: a `content-rendering` interface with a `render` function taking content-node input (raw properties JSON string) and returning `result<output, string>`, where `output` carries the HTML string
- [ ] 1.2 Add a `render-plugin` world to `apps/web/wit/plugin-worlds.wit` exporting `plugin-lifecycle` + `content-rendering`, leaving `wizard-plugin` unchanged
- [ ] 1.3 Regenerate guest types via `apps/web/scripts/wit-codegen.ts` and confirm the `render-plugin` world componentizes

## 2. First-party Markdown guest plugin

- [ ] 2.1 Author `apps/web/src/plugin/markdown/guest.ts`: `getManifest` declaring only `render:raw-html`, `initialize`/`shutdown`, and `render(input)` producing sanitizable static HTML from the node's Markdown content
- [ ] 2.2 Add the Markdown entry to `apps/web/plugins.config.json` with `world: "render-plugin"` and its own `outDir`
- [ ] 2.3 Build/package it through the existing pipeline (`package-plugin.ts`); add the transpiled output dir to the `eslint.config.mjs` global `ignores`
- [ ] 2.4 Unit-test the guest against `guest.js` directly (per AGENTS.md Bun/WASM rule): manifest shape, render output for representative Markdown, error `Result` on malformed input

## 3. Host WASM render execution + capability grant

- [ ] 3.1 Define the implicit system render-grant constant on the web render path and intersect it with the plugin manifest via `intersectCapabilities` (capped at `render:raw-html`)
- [ ] 3.2 In the render resolver (`block-renderer.tsx` + `registry.ts`), add the `rendererKind: 'wasm'` branch: locate the referenced `Plugin` node, decode/decompress `wasm_binary`, run the transpiled guest through `executeSandboxedGuestPlugin` with the intersected token and the node's raw properties JSON
- [ ] 3.3 Validate the output envelope with a Zod schema at the host boundary; on invalid/empty/error output, fall back to the native renderer and surface a non-fatal error (never mount unvalidated output)
- [ ] 3.4 Implement the async two-phase render: dispatch execution in an effect keyed by (node id, content hash), hold `{ pending | ok(html) | error }` in state, render placeholder/native-fallback while pending, discard superseded results on key change
- [ ] 3.5 Add a bounded (LRU) render-output cache keyed by (node id, content hash); instantiate the guest once and reuse it across calls
- [ ] 3.6 Reuse `BlockRenderer`'s existing `visited`-set cycle protection on the WASM path

## 4. Tier-1 sanitized inline rendering

- [ ] 4.1 Add `SanitizedHtmlRenderer` in `apps/web` (DOMPurify with `SANITIZE_DOM` + `SANITIZE_NAMED_PROPS`; mount sanitized output in a closed Declarative Shadow DOM root)
- [ ] 4.2 Apply the CSS policy: strip positioning (`position`, `z-index`) and external `url()` from sanitized style; decide any safe-subset allowance against the concrete Markdown output
- [ ] 4.3 Add DOMPurify as an `apps/web` dependency — newest minimum-release-age-eligible version, confirmed against no open sanitizer-bypass advisory
- [ ] 4.4 Unit-test sanitization: scripts and event-handler attributes stripped, `id`/`name` clobbering namespaced, positioning/external-`url()` CSS removed

## 5. Bootstrap install (replace native Markdown)

- [ ] 5.1 Seed the Markdown `Plugin` node into bootstrap (`packages/graph/src/bootstrap-definitions.ts`)
- [ ] 5.2 Switch `system:renderer:markdown` from `rendererKind: 'system'`/`entryPoint: 'system:markdown'` to `rendererKind: 'wasm'` targeting the seeded plugin; retain the native `markdown-renderer.tsx` component only as the resolution/execution-failure fallback
- [ ] 5.3 Update bootstrap tests for the re-pointed renderer

## 6. Verification and quality gates

- [ ] 6.1 Prove guest instantiation and end-to-end plugin render in a real browser via Playwright e2e (not just Bun unit tests); add any required transpiled-shim to the ignore list rather than ad-hoc workarounds
- [ ] 6.2 Add a rendering benchmark (mirroring the storage/queries benchmarks) measuring per-block WASM render cost
- [ ] 6.3 Run `bunx openspec validate wasm-content-rendering --strict`
- [ ] 6.4 Run build → lint → typecheck → test across the workspace
