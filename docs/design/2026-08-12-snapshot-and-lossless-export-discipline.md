# Snapshot and lossless-export discipline

> Status: **accepted** (guard/invariant; no code change, no tasks staged)
> Scope: the discipline that keeps materialized snapshots and log compaction from eroding "the event log is the sole source of truth"; the discipline that keeps every portable export lossless
> Type: decision / invariant guard
> Bead: `canopy-x85`
> Depends on: [2026-02-08-event-system.md](2026-02-08-event-system.md) §8–9, [2026-02-08-storage-layer.md](2026-02-08-storage-layer.md) §4, [2026-07-03-event-log-storage-and-sync.md](2026-07-03-event-log-storage-and-sync.md), [2026-08-12-crdt-vs-event-log-revisited.md](2026-08-12-crdt-vs-event-log-revisited.md)

---

## 1. Why this exists now

Canopy's event log is the sole persisted source of truth; the materialized `Graph` is a disposable projection.
Two future optimizations threaten that invariant if they are built without a rule in place first:

- **Projection snapshots** for fast startup (storage-layer §4): a serialized graph state at an eventId, so startup replays only the tail.
- **Log compaction** for space (event-system §9): snapshotting, folding, or archival to bound log growth.

Both are legitimate and both are currently open questions, not implemented.
This document is written _before_ either is implemented so the invariant is protected by design rather than rescued after a regression.

The lesson is Logseq's, made concrete by its DB-version rewrite ([research 2026-08-12 axis B](../research/2026-08-12-logseq-2.0-comparison.md)).
Logseq's "file over app" backlash — which forked the product — was driven by two things happening together: the _canonical_ store became an opaque SQLite database, and the _portable_ export (Markdown) went lossy.
Canopy is on the right side of that trade today (the canonical artifact is the human-readable append-only log).
The failure mode to prevent is a "materialized snapshot for speed" optimization quietly becoming a second, authoritative, non-portable store — Logseq's mistake, arrived at from the opposite direction.

---

## 2. The invariant

> **The event log is the only source of truth. Every snapshot is a rebuildable cache. Every portable export is lossless.**

This restates and hardens storage-layer §4 ("snapshots are an optimization, not a requirement; the system must always be able to rebuild from the full event log") and extends it with the export half of the Logseq lesson.

---

## 3. Rules

These are binding on any future snapshot, compaction, or export work.

### Snapshots

1. **A snapshot is a pure function of the log up to an eventId.** It carries the eventId (and `revision` token) it was taken at, and must be byte-for-byte reproducible by replaying the log to that eventId. A snapshot is a cache, never an input to a decision the log could not make on its own.
2. **Replay wins on disagreement.** If a snapshot and a fresh projection from the log ever diverge, the snapshot is wrong by definition and is discarded and rebuilt. No reconciliation, no merge — the log is authority.
3. **Snapshots are disposable and optional.** The system must start, sync, and project correctly with every snapshot deleted. A snapshot may always be thrown away; it must never be the only way to reach a state.
4. **No second writer of truth.** Nothing consumes a snapshot as authoritative state that then feeds new writes. Writes are derived from the projection, which is derived from the log; a snapshot is a shortcut to the projection, not a parallel truth.

### Compaction

5. **Compaction must not lose any event whose absence changes the projection.** Tombstone/GC of a node in the _materialized view_ (event-system §8) is fine because it is a view operation; removing the corresponding events from the _log_ is only permitted if the compacted representation replays to the identical projection. Prefer snapshotting (event-system §9 calls it the least destructive, most values-aligned strategy) over folding or deletion.
6. **Compaction is opt-in and preceded by a lossless export.** Any strategy that would make the pre-compaction history unrecoverable requires an explicit user action and must write a lossless export of the discarded range first. Silent, automatic, destructive compaction is prohibited.
7. **History/time-travel must survive the compaction policy the product commits to.** If event-log history is surfaced as a product feature (`canopy-qkp`), the guaranteed time-travel window and the compaction policy are one decision, not two — compaction cannot silently shrink a window the product promises.

### Portable export

8. **The log itself is the primary portable artifact and is lossless by construction.** Plain JSON events you can `cat`, `rg`, diff, and replay. This property is not to be traded away.
9. **Any additional export format is a convenience, and is either round-trip-lossless or explicitly labeled lossy.** A materialized/snapshot export, a Markdown render, or any human-friendly form may exist, but it may never be presented as _the_ backup unless it round-trips to the same graph. A lossy export is never the only export offered.
10. **A portable snapshot format (storage-layer §4 open question) inherits rules 1–4 and 9.** Migrating a snapshot between backends is a cache transfer, not a truth transfer; the log remains the thing that must move for the data to move.

---

## 4. Failure modes this guards against

- **Snapshot-as-truth drift:** a snapshot is edited or repaired in place and the log is not; the graph now depends on an artifact no replay can reproduce. Rule 1–2 forbid it.
- **Silent lossy compaction:** an automatic GC drops old events to save space and quietly destroys the ability to reconstruct past states. Rules 5–6 forbid it.
- **Opaque-canonical creep:** the snapshot becomes the fast path everything reads, the log becomes a write-only journal nobody replays, and over time only the snapshot is trusted — Logseq's opaque-store outcome reached by neglect. Rules 3–4 forbid it.
- **Lossy-export lock-in:** the only offered backup is a materialized/Markdown export that cannot round-trip, so users who "own their data" own a lossy copy. Rules 8–9 forbid it.

---

## 5. How this is enforced

- **Design-time:** any OpenSpec change that adds snapshotting, compaction, or a new export format must cite this document and show, in its adversarial-review section, how it satisfies rules 1–10.
- **Test-time (when snapshots ship):** a property test asserting `project(fullLog) === project(snapshot + tailAfterSnapshot)` for arbitrary logs and snapshot points — the executable form of rules 1–2. A second property asserting a compacted log replays to the identical projection as the original — the executable form of rule 5.
- **Review-time:** a change that introduces a shared writable snapshot, an in-place snapshot edit, or a destructive default compaction is rejected on the basis of this document, the same way a shared-writable-stream transport is rejected against the single-writer invariant ([sync transports §11](2026-08-12-multi-device-sync-transports.md)).

---

## 6. Consequences

- No code changes from this document; it records a guard so the invariant is not re-derived (or violated) when snapshot/compaction work is eventually prioritized.
- The relevant open questions stay open — _which_ compaction strategies (event-system §9 open question, list item 6) and _which_ snapshot format (storage-layer §4 open question) — but they are now bounded: whatever is chosen must satisfy §3.
- Ties to `canopy-qkp` (time-travel as a product feature): the compaction policy and the promised history window are decided together (rule 7).
