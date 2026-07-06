## 1. Storage split + IndexedDB event log

- [x] 1.1 Create `packages/storage-indexeddb` (`@canopy/storage-indexeddb`, dep `idb`) and `packages/storage-sqlite` (`@canopy/storage-sqlite`, dep `sql.js`); wire into workspaces, `tsconfig.build` references, and the CI package matrix
- [x] 1.2 Move the existing SQLite adapter and its event log into `@canopy/storage-sqlite`, dropping its Yjs-snapshot surface; move existing tests
- [x] 1.3 Implement `EventLogStore` in `@canopy/storage-indexeddb`: events object store keyed by `[graphId, eventId]`, idempotent `appendEvents` (dedup by eventId), `getEvents` honoring `after`/`before`/`limit`/`reverse` in eventId order
- [x] 1.4 Reduce `@canopy/storage` to contract re-exports plus the in-memory `EventLogStore`; keep the legacy Yjs-snapshot `StorageAdapter` and IndexedDB store temporarily (import read path for group 3), marked deprecated
- [x] 1.5 Unit tests for the IndexedDB adapter (idempotent append, range queries, multi-graph isolation) using the same cases as the in-memory/SQLite suites

## 2. Graph session + convergent projection

- [x] 2.1 Extend incremental projection in `@canopy/graph` with merge metadata: per entity per property last-writer eventId (removals tracked as writes), additive edges keyed by EdgeId, permanent idempotent tombstones
- [x] 2.2 Implement the pending buffer: park events with unsatisfied references or incomplete batches keyed by missing dependency, drain on arrival, age-threshold warnings
- [x] 2.3 Implement `createGraphSession(eventLog, graphId, deviceId)`: `load` (read log, project), `commit` (validate → append → merge → notify), `graph()`, `subscribe` — notifications carry the updated graph plus the applied-event delta (parked events appear in a delta only when they drain)
- [x] 2.4 Property-based convergence test: generated multi-device event sets, assert `incremental(shuffle(E)) === projectGraph(sort(E))` across random permutations and partitions
- [x] 2.5 Unit tests for session commit failure paths (validation rejection leaves log and projection untouched) and load-equals-fold

## 3. Web app cutover

- [x] ~~3.1 Implement the one-time Yjs vault import~~ -- **skipped by decision 2026-07-05**: no real vaults exist pre-1.0 (all dogfood data is fabricated/disposable), so there is nothing to migrate. `createIndexedDBAdapter`/`StorageAdapter`/`GraphStorageMetadata` are left in place, untouched, for task 4.2 to remove.
- [x] 3.2 Rewire `GraphProvider` (`apps/web/src/context/graph-context.tsx`) and `storage-context` from `SyncEngine` + snapshot save to `GraphSession` + `@canopy/storage-indexeddb`. No import step (see 3.1). Added an unplanned but required piece: `@canopy/storage-indexeddb`'s new `createGraphRegistry` (a small dedicated IndexedDB store for `{id, name, createdAt, updatedAt}`) backs `home-page.tsx`'s list/create/delete, since `EventLogStore` has no enumerate-all-graphs operation and the deprecated `StorageAdapter` is no longer touched at all post-3.1-skip.
- [x] 3.3 Route all node/edge/type-authoring creation paths through `session.commit` (ops already produce events; deleted the `applyCreatedNode` Yjs replay shim). Also added `updateNodeProperties`/`deleteNode` context actions so `node-page.tsx` no longer needs direct store access.
- [x] 3.4 Rewrite the block editor (`apps/web/src/components/editor/block-editor.tsx`, `node-page.tsx`): local (DOM-owned/uncontrolled) state editing, debounced `content` property commits (idle ~1s, blur, unmount/navigation flush), no `Y.Text`. Property key is `content`, not `text` -- see decision below.
- [x] 3.5 Provision a stable per-installation deviceId (`apps/web/src/utils/device-id.ts`, generated once via `createDeviceId()`, persisted in `localStorage`) and replace every `PLACEHOLDER_DEVICE_ID` / zero-deviceId use in `apps/web`
- [x] 3.6 Updated unit/integration tests for the new wiring (`graph-integration.test.tsx`, `block-editor.test.tsx`, new `graph-registry.test.ts`/`device-id.test.ts`); added a new Playwright e2e (`block-editor.e2e.ts`) covering edit -> blur-commit -> reload -> persisted content, alongside the existing node-creation and schema-authoring e2e flows. All green.

**Decision (2026-07-05): block content stays on the `content` property, not `text`.**
The design doc's `text`/`content` naming split (TextBlock/CodeBlock use `text`, MarkdownNode uses `content`) was never actually implemented in `bootstrap.ts` -- all three block node types use `content` today, and rendering is a hardcoded `switch (node.type)` in `block-renderer.tsx`, not yet resolved via the graph-resident `Renderer` concept (`meta:renderer`/`RENDERER_DEF`). Renaming to match the doc would touch `bootstrap.ts`'s type schemas and the renderers -- out of scope for this cutover, and arguably belongs with the eventual renderer-resolution work instead. Kept `content` everywhere to avoid a schema/rendering change bundled into a storage-plumbing change.

## 4. Yjs removal + docs

- [x] 4.1 Delete `packages/sync` and remove `@canopy/sync` from workspaces, CI matrix, and all references
- [x] 4.2 Delete the legacy `StorageAdapter` interface, the Yjs-snapshot IndexedDB store, and `GraphStore` in `@canopy/storage/types.ts` if nothing uses it post-cutover. Also dropped `@canopy/storage-indexeddb`'s now-dangling `@canopy/storage` dependency (its only consumer, `indexeddb-adapter.ts`, is deleted).
- [x] 4.3 Remove `yjs` and `y-protocols` from every `package.json`; verify the lockfile has no Yjs remnants
- [x] 4.4 Update `docs/architecture/bounded-contexts.md` (package map, dependency diagram, `EventLogStore`/session notes). Also fixed a stale `@canopy/sync` mention in `docs/architecture/graph-model.md` (current-state doc per `docs/AGENTS.md`).
- [x] 4.5 Run full quality gates (clean rebuild including `*.tsbuildinfo` removal, `bun test`, typecheck, lint, e2e)
