## Why

The shipped persistence and sync stack contradicts the documented architecture: `@canopy/sync` wraps a Yjs `Y.Doc` and `@canopy/storage`'s IndexedDB adapter persists opaque Yjs snapshots, while `docs/design/2026-02-08-storage-layer.md` and `docs/design/2026-02-08-sync.md` specify an event log as the source of truth with no CRDT dependency.
The reconciliation decision landed in `docs/design/2026-07-03-event-log-storage-and-sync.md` (bead `canopy-1q5.1`): the event log wins, Yjs is removed entirely.
This change implements that migration; every pluggable-backend follow-on (`canopy-1q5.2`/`.3`/`.4`) is blocked until it ships.

## What Changes

- A `GraphSession` in `@canopy/graph` becomes the single write path: op events → validation → `EventLogStore` append → incremental projection → notification.
- Incremental projection gains the convergence invariant from the design doc: per-property last-writer tracking, additive edges, tombstone-wins, and a pending buffer, so applying any permutation of any subset of events equals the ordered fold (verified by a property-based test).
- `@canopy/storage` is reduced to contract re-exports plus the dependency-free in-memory `EventLogStore`; the IndexedDB and SQLite backends move to new per-backend packages `@canopy/storage-indexeddb` (`idb`) and `@canopy/storage-sqlite` (`sql.js`).
- `@canopy/storage-indexeddb` implements `EventLogStore` (events keyed by `[graphId, eventId]`) and a one-time import that synthesizes creation events from a legacy Yjs snapshot's materialized state.
- `apps/web` cuts over: `GraphProvider` drops `SyncEngine` for `GraphSession`; the block editor drops `Y.Text` for debounced `NodePropertiesUpdated` commits of the `text` property.
- **BREAKING (internal only)**: `@canopy/sync` is deleted, along with the Yjs-snapshot `StorageAdapter` interface and all `yjs`/`y-protocols` dependencies. Awareness (presence) and `Y.UndoManager` go away; short-term undo becomes a local editor concern.
- Out of scope: the file-based/Google Drive sync backend (`canopy-1q5.3`/`.4`) and the server API backend (`canopy-1q5.2`) — designed in the design doc, implemented as follow-on changes.

## Capabilities

### New Capabilities

- `graph-session`: the event-sourced write path in `@canopy/graph` — session lifecycle (load/project, commit, subscribe) and convergent incremental projection with the permutation-invariance guarantee. Lives in `@canopy/graph`.
- `event-log-persistence`: the event log as the persisted source of truth — per-backend storage packages, the IndexedDB `EventLogStore`, the in-memory contract implementation, and the one-time legacy Yjs vault import.
- `block-editing`: the `apps/web` block editor over event-sourced text — debounced `text`-property commits, local-only short-term undo, no CRDT.

### Modified Capabilities

(none — no existing `openspec/specs/` capability has requirement-level changes; `type-authoring`, `schema-ui`, and `eslint-functional-enforcement` are unaffected in behavior, though `schema-ui`'s wiring moves from `SyncEngine` to `GraphSession`)

## Impact

- `packages/graph`: new `GraphSession`, incremental projection extended with merge metadata (per-property last-writer eventId, tombstones, pending buffer); `applyEvent`/`projectGraph` semantics preserved as the canonical ordered fold.
- `packages/storage`: shrinks to contracts + in-memory; `StorageAdapter` (Yjs snapshots) deleted; `GraphStore` interface deleted if nothing uses it post-cutover.
- New packages `packages/storage-indexeddb`, `packages/storage-sqlite`; workspace/CI matrix updated.
- `packages/sync`: deleted entirely (Yjs imports exist only there today).
- `apps/web`: `GraphProvider`, `storage-context`, `node-page`, `block-editor` rewired; e2e flows re-verified.
- Docs: `docs/architecture/bounded-contexts.md` package map updated; implementation-note callouts in the two 2026-02-08 design docs resolved to point at the decision doc.
- Related tracking: bead epic `canopy-1q5`; decision bead `canopy-1q5.1` closes with this proposal.
