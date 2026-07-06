## Context

The full reconciliation design — including the file-based sync wire format that is out of scope here — is `docs/design/2026-07-03-event-log-storage-and-sync.md`.
This document covers the decisions needed to implement the migration itself.

The kernel is already event-native: `@canopy/graph` owns `GraphEvent` (UUIDv7 `eventId`, `deviceId`, optional `batchId`), pure projection (`applyEvent`, `projectGraph`), history, the event bus, and the `EventLogStore` port; ops already return `GraphResult` carrying events; in-memory and SQLite `EventLogStore` implementations exist.
The Yjs layer is a parallel write path that bypasses all of it: `@canopy/sync`'s `addNode`/`addEdge` mutate `Y.Map`s directly without recording events, and persistence is a whole-doc Yjs snapshot saved to IndexedDB on every mutation.
Existing vaults therefore have no reliable event history — the materialized `Y.Map` state is the only truth in legacy data.

## Goals / Non-Goals

**Goals:**
- One write path: op → events → validate → append → project → notify, per the event lifecycle in `2026-02-08-event-system.md` section 7.
- Incremental projection that converges under out-of-order, partial delivery — the property that makes every future sync backend (file, HTTP, server) a dumb event carrier.
- Per-backend storage packages so third-party deps (`idb`, `sql.js`, future HTTP/Drive clients) stay isolated.
- Zero Yjs by the final task group: no `yjs`/`y-protocols` in any lockfile-reachable dependency graph.
- Existing dogfood vaults survive via a one-time import.

**Non-Goals:**
- The file-based/Drive sync backend and server API backend (`canopy-1q5.2`/`.3`/`.4`) — the design doc specifies the file format; implementation is follow-on changes.
- Persisted projection snapshots for fast startup — replay of personal-vault logs through `projectGraph` is milliseconds-scale; deferred until felt.
- Log-aware undo via inverse events — `Y.UndoManager`'s replacement is local editor undo for now.
- Real-time collaboration or presence — no transport exists; the CRDT re-entry point is documented in the design doc (per-property merge strategy) but nothing is built for it.
- Preserving pre-cutover history — there is none to preserve (see Context).

## Decisions

**`GraphSession` lives in `@canopy/graph`, not a new package or the app.**
Alternatives: a new `@canopy/session` package, or app-level orchestration in `GraphProvider`.
The kernel already owns every ingredient (the `EventLogStore` port, projection, validation, the event bus) and gains no new dependencies from the session; a separate package would be a wrapper with nothing of its own to own, and app-level orchestration would be re-implemented by every future consumer (CLI, desktop).

**Incremental projection is order-insensitive by construction, not replay-based.**
Alternative: keep the sequential fold and handle late-arriving events by re-projecting from the nearest snapshot before the insertion point.
Rejected: replay-on-out-of-order makes ingest cost depend on how late an event arrives and drags snapshot infrastructure (explicitly deferred) into the critical path.
Instead the materialized state tracks, per entity per property, the eventId of the last applied write (removals included); an incoming write applies iff its eventId is greater.
Edges are additive by EdgeId; deletes are permanent idempotent tombstones; events with unsatisfied references or incomplete batches park in a pending buffer keyed by the missing dependency.
The canonical semantics remain the ordered fold — the invariant `incremental(shuffle(E)) === projectGraph(sort(E))` is enforced by a property-based test over random device partitions and permutations, and full rebuild from the log stays the recovery path.

**Big-bang cutover in the app, staged across PR-sized task groups.**
Alternative: a strangler phase dual-writing Yjs and the event log.
Rejected: the app has exactly one write context (`GraphProvider`) and one editor page; dual-write reconciliation code would exceed the code being migrated and would itself need conflict handling.
Kernel and storage work (groups 1–2) land green without touching the app; the app flips in one group (3); removal follows (4).

**Yjs is removed from the block editor too; text is a plain `text` property with debounced event commits.**
Alternative: keep `Y.Text` for editing ergonomics inside a session while persisting events.
Rejected: with no real-time transport, character-level merge buys nothing — and the content model (`2026-02-06-content-model.md`) already prescribes block nodes with a plain string `text` property, which keeps whole-property LWW acceptable (concurrent edits to different blocks never conflict) and event payloads small.
Commits fire on idle (~1s), blur, and navigation so the log is not one event per keystroke.
The losing side of any LWW conflict remains recoverable from the event log.

**Legacy import synthesizes creation events from materialized `Y.Map` state and ignores the `events` Y.Map.**
Alternative: import the `events` Y.Map as real history where present.
Rejected: that map was only populated by explicit `addEvent` calls the app never makes, so it is incomplete at best; reconciling partial event history against materialized state is complexity with no payoff on pre-1.0 dogfood data.
The import emits `NodeCreated`/`EdgeCreated` with fresh eventIds, the importing device's deviceId, one shared batchId, and migration metadata naming the import; `Y.Text` content in the `texts` map becomes the `text` property in the corresponding `NodeCreated`.
The old snapshot record is left in place for rollback and deleted in a later cleanup, not in this change.

**`@canopy/sync` is deleted, not gutted.**
Alternative: keep the package as the future home of an event-replication engine.
Rejected: after Yjs removal its only honest scope would be an active-transport engine (WebSocket/LAN) that is not planned; file-based sync belongs to the future `@canopy/storage-file` because the storage format is the sync artifact.
An empty placeholder package is exactly the speculative surface the project avoids; a live transport, if ever built, recreates the package with real scope.

**Per-backend package names: `@canopy/storage-indexeddb`, `@canopy/storage-sqlite`.**
Named for the backend each owns, per the standing direction against bucket packages; `@canopy/storage` keeps the contract re-exports and the dependency-free in-memory implementation, so consumers that only need the port stay dependency-free.

## Risks / Trade-offs

- [Projection merge metadata grows the in-memory model] → per-property eventIds are strings alongside existing values; measured against personal-vault scale (thousands of nodes) this is noise, and the metadata is derived state, rebuildable from the log.
- [Pending buffer can hide permanently-orphaned events (a reference whose creator never arrives)] → age-threshold warnings surface stuck events; they remain in the log regardless, so nothing is lost.
- [Import fidelity: synthesized events lose provenance (original timestamps, authorship)] → accepted for pre-1.0 dogfood data; import events are batch-tagged and migration-tagged so provenance loss is at least explicit in the log.
- [Debounced text commits can lose sub-second edits on hard crash] → same exposure as the current save-on-mutation Yjs path; blur/navigation flushes cover the common cases.
- [LWW on whole `text` properties: two devices editing the same block offline resolve to one winner] → block-level granularity limits blast radius; the losing version is preserved in the log; accepted per the design doc's carve-out analysis.
- [Deleting `@canopy/sync` breaks anything silently importing it] → group 4 runs the full quality gates; `bounded-contexts.md` shows only `apps/web` and `@canopy/storage` depend on it, both rewired in group 3.

## Migration Plan

Task groups map to PR-sized steps, each leaving CI green:

1. Storage split + IndexedDB event log (kernel-independent).
2. `GraphSession` + convergent projection in `@canopy/graph` (storage-independent).
3. App cutover: `GraphProvider`, block editor, one-time vault import (depends on 1 and 2).
4. Yjs removal, package deletion, docs (depends on 3).

Rollback: groups 1–2 are additive; group 3 retains the legacy Yjs snapshot record untouched, so reverting the app PR restores the old stack fully; group 4 only lands once 3 has soaked.

## Open Questions

- Sealing thresholds, manifest cadence, and multi-process locking for the file backend — deferred to the `canopy-1q5.3`/`.4` follow-on (design doc sections 5 and 9).
- Whether `GraphStore` (materialized-view interface in `@canopy/storage/types.ts`) has any post-cutover consumer; delete in group 4 if not.
- Undo depth/UX in the block editor once `Y.UndoManager` is gone — local editor concern, decided at implementation.

## Amendments (2026-07-05, during group 3 implementation)

**The legacy Yjs vault import (task 3.1) was dropped, not implemented.**
No real vaults exist pre-1.0 — all dogfood data is fabricated and disposable — so there is nothing to migrate.
The deprecated `StorageAdapter`/`createIndexedDBAdapter`/`GraphStorageMetadata` in `@canopy/storage`/`@canopy/storage-indexeddb` are left untouched for group 4 to delete; nothing in the cutover reads them anymore.
This also removes the "rollback: group 3 retains the legacy snapshot" safety net above as a non-concern — there's no real data to protect, so group 4 (Yjs removal) doesn't need to wait for a soak period either.

**A graph registry was added — an unplanned but required piece.**
Cutting `apps/web` over to `EventLogStore` removed the only thing that let `home-page.tsx` list/create/delete named graphs: the deprecated `StorageAdapter`'s `list()`/`save()`/`delete()`, which was really a metadata side-table, not snapshot storage.
`EventLogStore` is intentionally scoped to a known `graphId` with no enumerate-all operation, and doesn't gain one here.
Added `@canopy/storage-indexeddb`'s `createGraphRegistry`: a small, independent IndexedDB store of `{id, name, createdAt, updatedAt}`, with no coupling to snapshots or events. This keeps the deprecated adapter purely a should-be-deleted-in-group-4 dead end, as originally intended.

**Block text/content stays on the `content` property, not `text`.**
`content-model.md`'s naming convention (TextBlock/CodeBlock use `text`, MarkdownNode uses `content`) was never implemented in `bootstrap.ts` — all three block node types use `content` today, and rendering is a hardcoded `switch (node.type)` in `block-renderer.tsx`, not a resolution through the graph-resident `Renderer` concept (`meta:renderer`/`RENDERER_DEF`) that would make the naming convention meaningful. Renaming to match the doc is a schema/rendering change, not a storage-plumbing one — deferred to whenever the renderer-resolution work happens, if ever. The block editor and the legacy-import-that-wasn't both use `content`.
