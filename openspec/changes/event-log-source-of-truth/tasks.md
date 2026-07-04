## 1. Storage split + IndexedDB event log

- [ ] 1.1 Create `packages/storage-indexeddb` (`@canopy/storage-indexeddb`, dep `idb`) and `packages/storage-sqlite` (`@canopy/storage-sqlite`, dep `sql.js`); wire into workspaces, `tsconfig.build` references, and the CI package matrix
- [ ] 1.2 Move the existing SQLite adapter and its event log into `@canopy/storage-sqlite`, dropping its Yjs-snapshot surface; move existing tests
- [ ] 1.3 Implement `EventLogStore` in `@canopy/storage-indexeddb`: events object store keyed by `[graphId, eventId]`, idempotent `appendEvents` (dedup by eventId), `getEvents` honoring `after`/`before`/`limit`/`reverse` in eventId order
- [ ] 1.4 Reduce `@canopy/storage` to contract re-exports plus the in-memory `EventLogStore`; keep the legacy Yjs-snapshot `StorageAdapter` and IndexedDB store temporarily (import read path for group 3), marked deprecated
- [ ] 1.5 Unit tests for the IndexedDB adapter (idempotent append, range queries, multi-graph isolation) using the same cases as the in-memory/SQLite suites

## 2. Graph session + convergent projection

- [x] 2.1 Extend incremental projection in `@canopy/graph` with merge metadata: per entity per property last-writer eventId (removals tracked as writes), additive edges keyed by EdgeId, permanent idempotent tombstones
- [x] 2.2 Implement the pending buffer: park events with unsatisfied references or incomplete batches keyed by missing dependency, drain on arrival, age-threshold warnings
- [x] 2.3 Implement `createGraphSession(eventLog, graphId, deviceId)`: `load` (read log, project), `commit` (validate → append → merge → notify), `graph()`, `subscribe` — notifications carry the updated graph plus the applied-event delta (parked events appear in a delta only when they drain)
- [x] 2.4 Property-based convergence test: generated multi-device event sets, assert `incremental(shuffle(E)) === projectGraph(sort(E))` across random permutations and partitions
- [x] 2.5 Unit tests for session commit failure paths (validation rejection leaves log and projection untouched) and load-equals-fold

## 3. Web app cutover

- [ ] 3.1 Implement the one-time Yjs vault import in `@canopy/storage-indexeddb`: read legacy snapshot via the deprecated adapter, synthesize batch-tagged `NodeCreated`/`EdgeCreated` (fresh eventIds, importing deviceId, migration metadata), `texts` map content as the `text` property; skip if the import batch already exists in the log
- [ ] 3.2 Rewire `GraphProvider` (`apps/web/src/context/graph-context.tsx`) and `storage-context` from `SyncEngine` + snapshot save to `GraphSession` + `@canopy/storage-indexeddb`, running the import on first load of a legacy vault
- [ ] 3.3 Route all node/edge/type-authoring creation paths through `session.commit` (ops already produce events; delete the `applyCreatedNode` Yjs replay shim)
- [ ] 3.4 Rewrite the block editor (`apps/web/src/components/editor/block-editor.tsx`, `node-page.tsx`): local state editing, debounced `text` property commits (idle ~1s, blur, navigation flush), no `Y.Text`
- [ ] 3.5 Provision a stable per-installation deviceId (generated once, persisted in the browser profile) and replace every `PLACEHOLDER_DEVICE_ID` / zero-deviceId use in `apps/web`
- [ ] 3.6 Update unit/integration tests for the new wiring; verify Playwright e2e flows (node creation, schema authoring, text editing survive reload)

## 4. Yjs removal + docs

- [ ] 4.1 Delete `packages/sync` and remove `@canopy/sync` from workspaces, CI matrix, and all references
- [ ] 4.2 Delete the legacy `StorageAdapter` interface, the Yjs-snapshot IndexedDB store, and `GraphStore` in `@canopy/storage/types.ts` if nothing uses it post-cutover
- [ ] 4.3 Remove `yjs` and `y-protocols` from every `package.json`; verify the lockfile has no Yjs remnants
- [ ] 4.4 Update `docs/architecture/bounded-contexts.md` (package map, dependency diagram, `EventLogStore`/session notes)
- [ ] 4.5 Run full quality gates (clean rebuild including `*.tsbuildinfo` removal, `bun test`, typecheck, lint, e2e)
