# Content renderers

## Overview

This directory implements the React block, document, and native fallback renderers along with WASM/native renderer registration, Tier-1/Tier-2 render dispatch and grant resolution, HTML/CSS sanitization, bounded render caching, and worker-isolated untrusted guest execution. `BlockRenderer` resolves each node's `ViewDefinition` and `USES_RENDERER` edge to dispatch between system renderers, Tier-1 sanitized shadow-DOM WASM execution (`WasmRenderedBlock`), Tier-2 sandboxed iframe execution (`Tier2RenderedBlock`), unavailable status, or `GenericPropertyTableInspector`.

## Interface

- `[block-renderer.tsx:BlockRendererProperties]`, `[block-renderer.tsx:renderUnavailableInteractiveRenderer]`, `[block-renderer.tsx:BlockRenderer]`
- `[code-block-renderer.tsx:CodeBlockRendererProperties]`, `[code-block-renderer.tsx:CodeBlockRenderer]`
- `[document-renderer.tsx:DocumentRendererProperties]`, `[document-renderer.tsx:DocumentRenderer]`
- `[generic-property-table-inspector.tsx:GenericPropertyTableInspectorProperties]`, `[generic-property-table-inspector.tsx:GenericPropertyTableInspector]`
- `[markdown-renderer.tsx:MarkdownRendererProperties]`, `[markdown-renderer.tsx:MarkdownRenderer]`
- `[renderer-error-banner.tsx:RendererErrorBannerProperties]`, `[renderer-error-banner.tsx:RendererErrorBanner]`
- `[sanitized-html-renderer.tsx:SanitizedHtmlRendererProperties]`, `[sanitized-html-renderer.tsx:SanitizedHtmlRenderer]`
- `[text-block-renderer.tsx:TextBlockRendererProperties]`, `[text-block-renderer.tsx:TextBlockRenderer]`
- `[tier2-rendered-block.tsx:Tier2RenderedBlockProperties]`, `[tier2-rendered-block.tsx:Tier2RenderedBlock]`
- `[wasm-rendered-block.tsx:WasmRenderedBlockProperties]`, `[wasm-rendered-block.tsx:WasmRenderedBlock]`
- `[execute-wasm-render-worker.ts:RenderWorkerUnavailableReason]`, `[execute-wasm-render-worker.ts:RenderWorkerUnavailableError]`, `[execute-wasm-render-worker.ts:SandboxedGuestRenderResult]`, `[execute-wasm-render-worker.ts:isRenderWorkerUnavailable]`, `[execute-wasm-render-worker.ts:executeSandboxedGuestPluginInWorker]`
- `[execute-wasm-render.ts:SYSTEM_RENDER_GRANT]`, `[execute-wasm-render.ts:WasmRenderErrorKind]`, `[execute-wasm-render.ts:WasmRenderResult]`, `[execute-wasm-render.ts:Tier1GuestLoader]`, `[execute-wasm-render.ts:ExecuteWasmRenderOptions]`, `[execute-wasm-render.ts:setTier1GuestForPlugin]`, `[execute-wasm-render.ts:clearTier1GuestsForTest]`, `[execute-wasm-render.ts:resolveTier1GuestLoader]`, `[execute-wasm-render.ts:executeWasmRender]`
- `[registry.ts:RegistryComponent]`, `[registry.ts:RENDERER_REGISTRY]`
- `[render-cache.ts:RenderCacheKeyInput]`, `[render-cache.ts:hashContent]`, `[render-cache.ts:renderCacheKey]`, `[render-cache.ts:getCachedRender]`, `[render-cache.ts:setCachedRender]`, `[render-cache.ts:clearRenderCache]`
- `[render-grants.ts:setRenderGrantForPlugin]`, `[render-grants.ts:resolveRenderGrant]`, `[render-grants.ts:resolveGuestId]`
- `[render-tier.ts:WasmRenderDispatch]`, `[render-tier.ts:resolveWasmRenderDispatch]`
- `[sanitize-html.ts:sanitizeStyleValue]`, `[sanitize-html.ts:sanitizeRenderedHtml]`
- Subdirectory: [tier2](./tier2/README.md) — Tier-2 iframe `srcdoc` CSP/sandbox builder, nonce-authenticated `postMessage` bridge, live-frame slot budget, and Tauri IPC absence guard.

## Invariants

- `[block-renderer.tsx:BlockRenderer]` Tracks visited `NodeId`s in a non-mutated `Set` for cycle protection and sorts `CHILD_OF` edges lexicographically by `'position'`.
- `[block-renderer.tsx:resolveRenderer]` Dispatches `rendererKind === 'wasm'` via `resolveWasmRenderDispatch`; `status === 'inactive'` on `rendererNode` or `pluginNode` yields `'unavailable'` for Tier-2 and `'property-table'` for Tier-1/system renderers; missing views or definitions cascade to native fallbacks or `GenericPropertyTableInspector`.
- `[sanitized-html-renderer.tsx:SanitizedHtmlRenderer]` Mounts `sanitizeRenderedHtml(html)` inside a `mode: 'closed'` `ShadowRoot` rather than host DOM.
- `[sanitize-html.ts:BLOCKED_STYLE_PROPERTIES]` Strips `'position'`, `'z-index'`, and any CSS declaration matching `/url\s*\(/i`; `[sanitize-html.ts:sanitizeRenderedHtml]` runs DOMPurify with `SANITIZE_DOM: true` and `SANITIZE_NAMED_PROPS: true`.
- `[execute-wasm-render-worker.ts:MAX_POOL_SIZE]` Caps the idle Web Worker pool at 4 instances; terminated workers are recorded in a `WeakSet` (`terminatedWorkers`) and discarded; `buildDispatchTable` restricts host imports to explicit read/write graph methods and returns `FORBIDDEN` otherwise.
- `[execute-wasm-render.ts:SYSTEM_RENDER_GRANT]` Narrows manifest capabilities against `'render:raw-html'` via `intersectCapabilities` and returns `'unavailable'` if empty.
- `[render-cache.ts:MAX_CACHE_ENTRIES]` Bounds the LRU cache to 256 entries, keyed by `nodeId`, `viewDefinitionId`, `rendererId`, sorted deduplicated token scopes, and FNV-1a `contentHash`.
- `[render-grants.ts:resolveRenderGrant]` Defaults unregistered plugin node IDs to `SYSTEM_RENDER_GRANT` (`'render:raw-html'`); `[render-tier.ts:resolveWasmRenderDispatch]` requires explicit non-wildcard `'render:interactive'` in both host grant and intersected manifest capabilities plus a defined `workerGuestId` for Tier-2, failing closed with `'missing-guest'` otherwise.
- `[tier2-rendered-block.tsx:Tier2Inner]` Serializes only `node.properties` (`contentToInput`), mounts the iframe with `TIER2_SANDBOX_TOKENS`, `TIER2_FRAME_ALLOW`, and `buildTier2FrameDocument(html, nonce)` only when ready, budgeted, and `!gaveUp` (3000 ms `FRAME_MOUNT_DEADLINE_MS`).

## Side Effects

- `[execute-wasm-render-worker.ts:createRenderWorker]` Spawns module Web Workers (`../../plugin/runtime/render-worker.ts`), mutates `idleWorkers` and `requestSequence`, posts `'execute'`/`'host-result'` messages, terminates failed/timed-out workers, and invokes graph access bindings.
- `[execute-wasm-render.ts:executeWasmRender]` Mutates `guestRegistryReference` via `setTier1GuestForPlugin`/`clearTier1GuestsForTest`, lazily imports `../../plugin/runtime/markdown-render-plugin`, and executes sandboxed guest plugins.
- `[render-cache.ts:cache]` and `[render-grants.ts:grantOverrides]` Mutate module-level `Map` state.
- `[sanitize-html.ts:purifier]` Lazily creates/memoizes a singleton DOMPurify instance and mutates element `style` attributes in its hook.
- `[sanitized-html-renderer.tsx:SanitizedHtmlRenderer]` Attaches a closed `ShadowRoot` and assigns `innerHTML` in `useEffect`.
- `[tier2-rendered-block.tsx:Tier2Inner]` and `[wasm-rendered-block.tsx:WasmRenderInner]` Mutate module-level `loggedFailures` `Set<string>`, call `console.warn` once per failing cache key, write to `render-cache`, acquire/release frame budget slots, and register `IntersectionObserver` / `window` `'message'` listeners / `setTimeout`.

## Verification

- Run: `bun test`
