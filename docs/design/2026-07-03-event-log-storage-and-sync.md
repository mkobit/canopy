# Event log storage and sync: reconciliation design

> Status: **decided**
> Scope: resolves the divergence between the shipped Yjs-based implementation and the documented event-log model; migration path, projection convergence, file-based sync format, Yjs retirement, package boundaries
> Depends on: [2026-02-08-event-system.md](2026-02-08-event-system.md), [2026-02-08-storage-layer.md](2026-02-08-storage-layer.md), [2026-02-08-sync.md](2026-02-08-sync.md), [2026-02-06-content-model.md](2026-02-06-content-model.md)
> Tracked in bead `canopy-1q5` (epic); this document closes `canopy-1q5.1`

---

## 1. Decision

The event log is the source of truth.
Yjs is removed entirely — from sync, from storage, and from the block editor.

This was directionally decided before this session.
This document works through the details: the migration path, the projection convergence mechanics, the wire format for eventual sync, Yjs's residual role (none, with a preserved re-entry point), and package boundaries.

The existing design docs remain the layer specifications.
This document is the reconciliation record: where it refines them, it says so explicitly.

---

## 2. Current state (what the migration starts from)

The kernel is already event-native; the Yjs layer is a parallel write path that bypasses it.

Already built and kept:

- `@canopy/graph` owns `GraphEvent` (`NodeCreated`, `NodePropertiesUpdated`, `NodeDeleted`, `EdgeCreated`, `EdgePropertiesUpdated`, `EdgeDeleted`, workflow events) with `eventId` (UUIDv7), `timestamp`, `deviceId`, optional `batchId`.
- Pure projection (`applyEvent`, `projectGraph`), history/time-travel, event bus, and the `EventLogStore` port.
- Ops (`createNamespace`, `createNodeType`, …) already return `GraphResult` carrying events.
- `EventLogStore` implementations exist: in-memory (`@canopy/storage`) and SQLite (events table in the SQLite adapter).

Replaced by this design:

- `@canopy/sync`: `SyncEngine` wraps a `Y.Doc` with four maps (`nodes`, `edges`, `events`, `texts`); `addNode`/`addEdge` mutate `Y.Map`s directly and do not record events.
- `StorageAdapter` (in `@canopy/storage`): persists opaque Yjs snapshots (`Y.encodeStateAsUpdate`) to IndexedDB.
- `apps/web` `GraphProvider`: mutations go through `engine.store.addNode`, persistence is whole-doc snapshot save on every mutation.
- Block editor: edits a `Y.Text` in the `texts` map keyed by node ID, persisted inside the Yjs snapshot.

Consequence for migration: existing vaults have no reliable event history.
The `events` Y.Map was only populated by explicit `addEvent` calls, which the app never makes; the materialized `Y.Map` state is the only truth in existing data.

---

## 3. Target architecture

The write path follows the event lifecycle already specified in the event system doc, section 7:

```
UI action
  → op in @canopy/graph (produces GraphEvents)
  → validation (structural, referential, type, namespace)
  → append to EventLogStore (persistence)
  → incremental projection (merge into in-memory Graph)
  → notification (event bus → React state)
```

A **graph session** orchestrates this.
It lives in `@canopy/graph` (it has no new dependencies; the kernel already owns the port, projection, and event bus):

```
createGraphSession(eventLog: EventLogStore, graphId, deviceId)
  load()                    — read events, project, hold current Graph
  commit(events)            — validate → append → merge → notify
  graph()                   — current projected Graph (immutable)
  subscribe(handler)        — change notification
```

Reads come from the projected `Graph`; there is no separate materialized store in the browser initially.
The projected graph is a *live* projection: `subscribe` fires after each merge, and the notification carries both the updated `Graph` and the delta (the events applied in that merge).
Incremental projection computes that delta anyway, and exposing it is what lets future live queries and reactive views (event lifecycle step 7 in the event system doc) refresh incrementally instead of re-scanning the graph — the queries layer stays a consumer of deltas, not a projection participant.
Session events are stamped with a real, stable per-installation deviceId (provisioned and persisted by the app); the current placeholder zero deviceId in `apps/web` breaks LWW tiebreaking the moment two devices exist, so it dies with the cutover.
A persisted projection snapshot (fast-start cache per the storage doc, section 4) is deferred: replaying a personal vault's log (thousands of events) through `projectGraph` is milliseconds-scale, so the optimization is not yet justified.
The design keeps the door open; nothing below assumes snapshots exist.

---

## 4. Projection convergence (refines event system doc, section 6)

The conflict resolution rules are already canonical: LWW per property with eventId tiebreak, additive edges, tombstone-wins deletes.
What this design adds is the **convergence invariant** that makes eventual sync trivial:

> Incrementally applying any permutation of any subset of events must produce the same graph state as sorting those events by eventId and folding in order.
>
> `incremental(shuffle(E)) === projectGraph(sort(E))`

The canonical semantics stay defined by the ordered fold (UUIDv7 timestamp, device-seeded tiebreak — a strict total order).
The invariant is an implementation obligation on incremental projection, achieved without replay:

- **Per-property last-writer tracking**: the materialized state records, per entity per property, the eventId of the last applied write.
  An update (or removal — removals are writes) applies iff its eventId is greater.
  Late-arriving older events lose silently and correctly.
- **Edge creation is additive and idempotent**: keyed by EdgeId.
- **Tombstones are permanent and idempotent**: a delete applies regardless of arrival order; later-arriving older updates to a tombstoned entity are no-ops in projection (but stay in the log).
- **Pending buffer**: events whose references are not yet satisfied (an `EdgeCreated` arriving before its endpoint's `NodeCreated`) or whose batch is incomplete are parked, keyed by the missing dependency, and drained as dependencies arrive.
  Parked events past an age threshold surface as warnings, not errors.

This is a last-writer-wins element map — CRDT semantics without a CRDT library, which is exactly the sync doc section 7 position.

Because out-of-order arrival never requires replay, full rebuild from the log is demoted to what the storage doc always said it was: a recovery operation.

**Testing obligation**: a property-based test generating event sets across simulated devices, asserting the invariant over random permutations and partitions.
This test is the heart of the migration's safety and must land with the incremental projection.

---

## 5. File-based eventual sync (refines sync doc, sections 3–4)

This is the wire format for the Google Drive-style case: a dumb replicated folder, out-of-order and partial delivery, no server logic.
It doubles as the on-disk single-device format — the local adapter and the eventual-sync backend are the same format, differing only in whether other devices' folders exist.

### Layout

```
<graph-root>/
  canopy.json                          — format version, graphId, graph name
  events/
    <deviceId>/
      <firstEventId>.jsonl             — event segments, one event per line
      manifest.json                    — sealed segments + head watermark
```

### Rules

- **Single writer per folder**: a device writes only under its own `events/<deviceId>/`.
  File conflicts under Drive/Dropbox replication become structurally impossible; other devices' folders are read-only inputs.
- **Segments**: JSON Lines, one Zod-validated event per line, in the device's own append order (which is eventId order, since a device's UUIDv7s are locally monotonic).
  The active segment is rewritten whole on flush (cloud-sync tools do not support appends); sealed segments are immutable and named by their first eventId, so listings sort chronologically.
- **Sealing**: at an event-count or byte threshold (e.g. 1,000 events or 1 MB — tune at implementation).
- **Batches never span segments**: all events sharing a batchId are flushed into the same segment file.
  Because a batch is produced by one device in one commit, this is free — and it resolves batch completeness (event system doc open question 4, sync doc open question 3) for this transport: any fully delivered file contains only whole batches.
- **Manifest**: lists sealed segment files and the head watermark (last eventId written).
  Readers poll manifests to detect novelty cheaply instead of listing and re-reading segment files.

### Reconciliation

Each device tracks one watermark per remote device folder: the last eventId consumed from it.
New events are whatever lies beyond the watermark in that device's ordered segments.
This answers the sync doc's open question 2 for this transport: per-device watermarks — a vector clock in effect, but held trivially by the directory structure, with no reconciliation protocol to speak of.

Ingest of remote events: validate → append to the local log (dedup by eventId) → incremental projection.
Section 4's convergence invariant absorbs out-of-order and partial segment delivery; the pending buffer absorbs cross-device referential gaps (device B's edge arriving before device A's node).

### Deferred from this transport design

- Snapshots for fast initial sync of a mature vault to a new device (storage doc, section 4) — full log transfer is acceptable at current scale.
- Conflict flagging for UX ("changed on another device", sync doc section 6) — the data supports it; build when the UI wants it.
- Concurrent writers on the same device folder from multiple processes (storage doc open question 8) — out of scope; assume one Canopy process per device for now.
- Signing and end-to-end encryption (sync doc section 8) — unchanged open questions.

---

## 6. Yjs's residual role: none, with a preserved re-entry point

Yjs is removed from the block editor too, not just from sync and storage.

Reasoning:

- There is no real-time transport (only an in-memory test provider), and the target deployment is single-user multi-device with eventual sync. Character-level CRDT merge buys nothing when replication granularity is "Drive syncs a file some minutes later".
- The content model already prescribes the alternative: blocks are nodes with a plain `text` string property. Block-level granularity keeps whole-property LWW acceptable (two devices editing different blocks never conflict) and keeps event payloads small.
- The event log preserves both sides of any lost LWW conflict; the losing text is recoverable from history rather than silently gone.

Mechanics of the replacement:

- The block editor edits local component state and commits `NodePropertiesUpdated` (property `text`) on debounce — idle (~1s), blur, or navigation — so the log is not one event per keystroke.
- `Y.UndoManager` goes away; short-term undo is the editor's local concern (browser-native for now).
  Log-aware undo via inverse events is a possible later feature on top of history.
- Awareness (presence/cursors) is dropped; it is meaningless without a real-time transport.

**Re-entry point** (per sync doc section 7's carve-out): if real-time collaboration becomes a goal, a text CRDT returns as a *per-property merge strategy*, not as the backbone.
A property type would declare its merge (`lww` today, `crdt-text` then); events would carry opaque CRDT deltas for such properties; projection would dispatch to the declared merge instead of LWW.
Section 4's per-property tracking is already shaped for this — merge strategy is a per-property decision.
Nothing is built for this now; the design just avoids precluding it.

Losses accepted and documented: intra-session collaborative editing, character-level offline merge of the same block, presence.
For a personal knowledge system these are acceptable; the epic's premise is that durability, auditability, and backend portability matter more.

---

## 7. Package boundaries

Following the per-backend-package direction (each backend's third-party deps stay isolated):

| Package | Contents | Third-party deps |
| --- | --- | --- |
| `@canopy/graph` | unchanged, plus `GraphSession` and incremental (convergent) projection | none |
| `@canopy/storage` | contract re-exports + in-memory `EventLogStore` | none |
| `@canopy/storage-indexeddb` | new; `EventLogStore` on IndexedDB (events store keyed by `[graphId, eventId]`), plus the one-time Yjs import reader during migration | `idb` |
| `@canopy/storage-sqlite` | new; the existing SQLite event log moves here, Yjs-snapshot surface stripped | `sql.js` |
| `@canopy/storage-file` | future (`canopy-1q5.3` / `.4`); the section 5 format — single-device write path first, multi-device ingest second | none expected |
| `@canopy/storage-http` | future (`canopy-1q5.2`); `EventLogStore` against a server API | HTTP client |
| `@canopy/sync` | **deleted** at the end of migration | — |

`@canopy/sync` is deleted rather than gutted: after Yjs removal its only honest scope would be an active-transport replication engine (WebSocket/LAN push), and no such transport is planned.
File-based sync lives in `@canopy/storage-file` because the storage format *is* the sync artifact.
If a live transport is ever built, a sync package returns with real scope.

The `StorageAdapter` interface (Yjs snapshot save/load) is deleted with it.
`GraphStore` (materialized-view interface in `@canopy/storage/types.ts`) is retained only if something uses it after the session refactor; otherwise it goes too — the projected `Graph` is the read model.

---

## 8. Migration path

Four PR-sized steps, each leaving CI green.
No dual-write strangler phase: the app has one write context and one editor page; a big-bang cutover in step 3 is smaller than maintaining two write paths.

1. **Storage split + IndexedDB event log** — create `@canopy/storage-indexeddb` and `@canopy/storage-sqlite`; reduce `@canopy/storage` to contracts + in-memory; implement `EventLogStore` on IndexedDB. Old Yjs-snapshot adapter stays temporarily (read path for step 3's import).
2. **Graph session + convergent projection** — `GraphSession` in `@canopy/graph`; incremental projection with per-property last-writer tracking, pending buffer, and the section 4 property-based convergence test. Pure kernel work, independent of step 1.
3. **Cut the app over** — `GraphProvider` drops `SyncEngine` for `GraphSession` + `@canopy/storage-indexeddb`; block editor moves to debounced `text` property commits; one-time vault import (below).
4. **Remove Yjs** — delete `@canopy/sync`, the Yjs-snapshot `StorageAdapter` and IndexedDB store, and all `yjs`/`y-protocols` dependencies; update `docs/architecture/bounded-contexts.md`.

### One-time vault import

Existing vaults are converted by reading the old Yjs snapshot and synthesizing events from the materialized state:

- For each node and edge in the `Y.Map`s: emit `NodeCreated` / `EdgeCreated` with fresh eventIds, the importing device's deviceId, one shared batchId, and migration metadata naming the import.
- `Y.Text` content in the `texts` map becomes the `text` property in the corresponding node's `NodeCreated`.
- The `events` Y.Map is ignored: it was never reliably populated, and preferring materialized state is deterministic.
- The old snapshot record is left in place (rollback safety) and deleted in a later cleanup, not in step 3.

Pre-cutover history is not preserved — there is none to preserve.
This is pre-1.0 dogfood data; the event log's history guarantees start at the import event.

---

## 9. Resolved and deferred questions

Resolved by this design:

- Event system doc q4 / sync doc q3 (batch completeness): batches never span segment files; per-file delivery guarantees batch completeness on the file transport. For other future transports, the pending buffer is the general mechanism.
- Sync doc q1 (file format): per-device append-ordered JSONL segments with manifests; individual-files-per-event rejected (too many small files for cloud sync tools), shared append-only log rejected (multi-writer conflicts).
- Sync doc q2 (set reconciliation): per-device watermarks via single-writer folders.
- Storage doc q2 (different backends for events vs view): yes by construction — the event log is the only persisted truth; the materialized view is in-memory (persisted view caches are an optimization for later).
- Storage doc q6 (migration tooling): the event log as portable artifact, demonstrated concretely by the Yjs import.

Still open (unchanged owners):

- Projection snapshot format and triggers (storage doc q1, q3) — deferred until startup replay cost is felt.
- Tombstone GC and log compaction (event system doc q5, q6).
- Signing and E2EE (sync doc q4, q5).
- Conflict-surfacing UX (sync doc q6).
- Same-device multi-process file access (storage doc q8).
- Log-aware undo via inverse events (new, replaces `Y.UndoManager`'s role).
