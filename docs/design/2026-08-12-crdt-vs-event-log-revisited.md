# CRDT (Yjs) vs. event-log source of truth, revisited

> Status: **decided** (revisit of a prior decision; no code change)
> Scope: whether the "no CRDT" decision that removed `@canopy/sync`/Yjs still holds, given everything shipped since 2026-07-03
> Type: architecture decision record (ADR)
> Bead: `canopy-dra` (decision)
> Depends on / supersedes-context: [2026-02-08-sync.md](2026-02-08-sync.md), [2026-02-08-storage-layer.md](2026-02-08-storage-layer.md), [2026-02-08-event-system.md](2026-02-08-event-system.md), [2026-07-03-event-log-storage-and-sync.md](2026-07-03-event-log-storage-and-sync.md)

---

## 1. Context

Canopy once shipped a Yjs-based CRDT layer (`@canopy/sync`) as its write and sync path.
It was deleted entirely — code, dependencies, and lockfile entries — in `canopy-1q5.8` (PR #352), and the block editor's `Y.Text` went with it.
The system now persists nothing but an append-only event log and derives all graph state by projecting that log.

This document re-examines that decision.
It does not relitigate the migration, which is settled and complete.
It asks one question: given the revision-token hardening, the `DraftSession`/daemon IPC surface, and — critically — the storage backends that have shipped since, does the no-CRDT decision still hold, or is there now a concrete scenario that tips back toward a CRDT?

The intended audience is a future proposal author who is tempted to reach for Yjs (or Automerge, or a homegrown CRDT) and needs a citable answer instead of re-deriving one.

### 1.1 A correction to the premise this revisit started from

The task that spawned this ADR — and the project memory it drew on — described the epic children `canopy-1q5.2` (`@canopy/storage-http`), `.3` (`@canopy/storage-file`), and `.4` (Drive-style multi-device ingest) as _still open, P4, deferred_, and framed them as the hypothetical future scenarios where the CRDT tradeoff would matter most.

That is stale.
Verified against current `bd` state and the working tree on 2026-08-12:

- `canopy-1q5.3` — `@canopy/storage-file` — **closed** 2026-07-15 (PR #370).
- `canopy-1q5.4` — multi-device replicated-folder ingest — **closed** 2026-07-15 (PR #371).
- `canopy-1q5.2` — `@canopy/storage-http` — **closed** 2026-07-20.
- The epic `canopy-1q5` — **closed** 2026-07-21, "all children completed".

`packages/storage-file/` and `packages/storage-http/` exist as real, tested implementations (`packages/storage-file/src/file-event-log.ts` is ~580 lines including a working multi-device `reconcile`).
`docs/architecture/bounded-contexts.md` still says "six packages" and omits both, so the canonical map lags reality; that is a documentation-debt follow-up, not a design gap.

This changes the analysis from speculative to empirical: the hardest case for a non-CRDT model — eventual sync across devices over a dumb replicated folder with out-of-order and partial delivery — is not a thought experiment.
It is shipped, and it works without a CRDT.
The verdict below rests on that fact rather than on prediction.

---

## 2. Decision drivers

The values that decide this, in priority order for a personal knowledge system:

1. **Durability and auditability.** Every change must be recoverable and explainable after the fact. Time-travel and history are product features, not debugging aids.
2. **Backend portability.** The persisted artifact must move between storage engines (browser, SQLite, files, HTTP server) without reinterpretation.
3. **Debuggability.** A maintainer must be able to read the persisted state with `cat` and `rg`, replay it deterministically, and reason about why the graph looks the way it does.
4. **Domain validity under merge.** Concurrent edits must never silently produce a graph that violates type/referential invariants.
5. **Implementation and dependency weight.** Fewer moving parts, smaller dependency surface, narrower public API.
6. **Real-time multi-writer collaboration.** Explicitly _not_ a current goal; a personal, single-user, multi-device system. Listed so its absence is a deliberate driver, not an oversight.

Drivers 1–4 favor the event log decisively.
Driver 6 is the only one that favors a CRDT, and it is the one Canopy has chosen not to serve.

---

## 3. Options considered

### Option A — CRDT as the backbone (the deleted `@canopy/sync` model)

A `Y.Doc` holds the graph as `Y.Map`s (`nodes`, `edges`, `texts`); mutations write CRDT structures directly; sync ships opaque binary updates; convergence is guaranteed by the CRDT merge function; persistence is a `Y.encodeStateAsUpdate` snapshot.
This is what shipped first and was removed.

### Option B — Event log as the sole source of truth (the shipped model)

Every mutation is a `GraphEvent` appended to an `EventLogStore`.
The graph is derived by projecting the log.
Conflict resolution is last-writer-wins per property with an eventId tiebreak, additive edges, and permanent tombstones — "CRDT semantics without a CRDT library" ([2026-07-03 doc §4](2026-07-03-event-log-storage-and-sync.md)).
This is the current architecture.

### Option C — Hybrid: event log as backbone, CRDT as a per-property merge strategy

Everything is Option B, except a property may _declare_ its merge strategy.
`lww` today; a hypothetical `crdt-text` for a property that needs character-level concurrent-edit convergence.
Events carry opaque CRDT deltas only for such properties; projection dispatches to the declared merge instead of LWW.
This is not built.
The 2026-07-03 design deliberately shaped the per-property last-writer tracking so this remains reachable ([§6, "re-entry point"](2026-07-03-event-log-storage-and-sync.md)).

The decision is Option B, with Option C held as a scoped, non-precluded future escape hatch.
Option A is off the table.

---

## 4. What the original rationale said

The 2026-02-08 sync doc (§7) rejected a CRDT dependency on the grounds that event replication is a strictly simpler problem than CRDT-based collaborative data structures:

- Conflict resolution is timestamp-based LWW, applied during projection — not a CRDT merge.
- Deduplication is by EventId.
- Ordering is by UUIDv7 timestamp with a device-ID tiebreaker, giving a strict total order.
- These are "simple, well-understood mechanisms that do not require a CRDT framework".
- A single carve-out: if real-time collaborative _text_ editing ever becomes a goal, a character-level CRDT can return "as a scoped addition without changing the core sync model".

The storage doc reinforced this with the portability argument: the event log is the portable artifact that makes backend migration a matter of export-log / import-log / rebuild-view.

The 2026-07-03 reconciliation doc then made the rejection concrete and total.
It removed Yjs from the block editor as well, on the reasoning that character-level CRDT merge "buys nothing when replication granularity is 'Drive syncs a file some minutes later'", and that block-level property LWW is acceptable because two devices editing different blocks never conflict.
It also recorded the honest losses: intra-session collaborative editing, character-level offline merge of the same block, and presence.

The original reasoning was sound on paper.
The rest of this document checks it against what is now in the tree.

---

## 5. The model as actually shipped (verified against code)

Every claim below was read out of the current working tree, not the design docs.

- **Event log port** (`packages/graph/src/event-log.ts`): the entire persistence contract is two methods — `appendEvents(graphId, events)` and `getEvents(graphId, options)`, both returning `Promise<Result<…, Error>>`. There is no conflict logic, no merge, no replay in the port. Storage backends are dumb event carriers.
- **Five backends implement that two-method port**: in-memory (`@canopy/storage`), IndexedDB (`@canopy/storage-indexeddb`), SQLite (`@canopy/storage-sqlite`), files (`@canopy/storage-file`), and HTTP (`@canopy/storage-http`). None of them understand the graph.
- **Single write path** (`packages/graph/src/graph-session.ts`): `commit` runs `validateCommit` (structural + referential via a dry-run `projectGraph`, plus type conformance via `validateNode`/`validateEdge`) → `appendEvents` → incremental `mergeEvents` → subscriber notify. Nothing mutates a graph outside this path.
- **Convergent incremental projection** (`packages/graph/src/incremental-projection.ts`) implements the invariant `incremental(shuffle(E)) === projectGraph(sort(E))` via: per-property last-writer tracking keyed by eventId (removals count as writes), additive-idempotent edges keyed by EdgeId, permanent-idempotent tombstones, and a pending buffer that parks events with unmet referential or batch dependencies and drains them transitively as dependencies arrive. Stale pending groups surface as warnings, not errors. This is a last-writer-wins element map — the CRDT-equivalent semantics the docs promised, in plain code.
- **Revision token** (`packages/graph/src/revision.ts`, `canopy-zm3`, PR #441): `Graph.revision` is a branded, eventId-derived running-max token — permutation-invariant, monotonic, and independent of the wall-clock `metadata.modified` field it replaced for concurrency checks. `maxRevision` is a lexicographic max over UUIDv7 eventIds; because two events in the same millisecond still have distinct random-seeded UUIDv7s, it has no same-tick collision gap (the bug that motivated the hardening).
- **Optimistic concurrency, not merge** (`packages/graph/src/draft-session.ts`): `DraftSession.commit(expectedParentRevision)` compares the parent graph's current `revision` to the expected one and returns `{ type: 'concurrent-modification' }` on mismatch, forcing the caller to re-base. This is the daemon's `canopy.v1.draft.*` write path. It is deliberately the _opposite_ of CRDT auto-merge: an agent-proposed draft that raced a concurrent commit is rejected and re-derived, not silently blended.
- **Multi-device eventual sync is real** (`packages/storage-file/src/file-event-log.ts`): `reconcile(graphId)` scans other devices' `events/<deviceId>/` folders, tracks one watermark per remote device, reads only events beyond that watermark, dedups by eventId, appends locally, and re-projects. Per-device single-writer folders make Drive/Dropbox file conflicts structurally impossible. The "vector clock" is the directory structure. There is no reconciliation protocol and no CRDT.

The shipped system is Option B, exactly as designed, and the hardest transport for it is in the tree and tested.

---

## 6. Comparison

Each dimension compares Option A (CRDT backbone) against Option B (event log), for Canopy's actual usage: single user, multiple devices, eventual (not real-time) sync.

### 6.1 Conflict-resolution semantics

**Event log:** LWW per property with eventId tiebreak; additive edges; delete-wins tombstones.
Deterministic, total-ordered, and — crucially — the loser is _preserved in the log_, recoverable from history.
Merge runs _after_ projection reconstructs domain entities, so `validateCommit`/`validateNode` see the merged result.

**CRDT:** merge is guaranteed to converge, but convergence is a data-structure property, not a domain-validity property.
Two independently valid edits can merge to a state that violates a NodeType's required-property or referential invariants, and a `Y.Map`-native model has no natural place to run domain validation over the merged result — the merge already happened inside the CRDT.
CRDT also does not preserve the losing value at the application layer the way an append-only log does; last-writer-loses content is gone unless you keep a separate history.

**Verdict:** event log wins on driver 4 (domain validity) and driver 1 (auditability). CRDT wins only on automatic character-level convergence, which Canopy does not need at block-property granularity.

### 6.2 Offline / multi-device / multi-writer

**Event log:** offline-first by construction — the local log always accepts writes; sync is set reconciliation by eventId. Multi-_device_ single-user works today (`reconcile`). Multi-_writer_ real-time (two people, same second, same block) is not served: LWW picks one block value and files the other in history.

**CRDT:** its reason to exist. Real-time multi-writer character-level merge with presence is where Yjs earns its complexity. For eventual, single-user, minutes-latency sync, that machinery is dead weight — the 2026-07-03 doc's "buys nothing when Drive syncs a file some minutes later" is confirmed by the shipped `reconcile`, which needed none of it.

**Verdict:** even for the single-user, multi-device case that Canopy _does_ serve, the event log covered it without a CRDT. CRDT wins only in the unserved real-time-collaboration quadrant.

### 6.3 Storage and bandwidth overhead

**Event log:** append-only and unbounded; tombstones are permanent; there is no in-place GC yet (compaction/snapshotting remain open questions). Sync ships whole events (coarse-grained). At personal-vault scale (thousands of events, ms to project) this is a non-issue; at very large scale it is a known future cost with a known mitigation (snapshots).

**CRDT:** also accumulates — Yjs retains deleted-item tombstone IDs in the struct store and needs its own GC; snapshots are opaque binary blobs. Bandwidth is finer-grained (per-op deltas), which is genuinely more efficient for high-frequency real-time editing, and largely irrelevant when the transport is a file synced every few minutes.

**Verdict:** roughly a wash on growth (both accumulate and both need compaction). CRDT's finer-grained bandwidth advantage only pays off under real-time editing. Event log wins on the portability of what it stores (plain JSON vs. opaque binary).

### 6.4 GC / tombstone handling

**Event log:** tombstones are permanent and idempotent in projection; log compaction (snapshot / fold / archive) is explicitly deferred until startup-replay cost is felt. History-preservation is the stated reason to prefer snapshotting over folding.

**CRDT:** Yjs GC reclaims deleted _content_ but keeps tombstone identifiers to preserve convergence; you cannot fully forget without risking merge anomalies with a peer that missed the deletion.

**Verdict:** comparable in that both defer real GC; event log's deferral is cleaner because "rebuild from log" is always a correct fallback and the log is the only truth.

### 6.5 Implementation and debugging complexity

**Event log:** the persisted artifact is human-readable JSON — `packages/storage-file` literally writes JSONL segments you can `cat` and `rg`. Projection is a pure, deterministic fold; a bug is reproducible by replaying the log. The convergence invariant is guarded by a property-based test. Zero third-party CRDT dependency; the whole merge is a few hundred lines of ordinary TypeScript.

**CRDT:** opaque binary updates; debugging a bad merge means understanding Yjs internals; the dependency is large and its wire format is not yours. The original migration doc noted the shipped Yjs `events` map was _never reliably populated_ — the CRDT gave the appearance of history without the substance.

**Verdict:** event log wins decisively on drivers 3 and 5.

### 6.6 Auditability and history (time-travel)

**Event log:** time-travel is a direct consequence of the model — `history.ts` reconstructs any point in time by folding the log up to an eventId. Every change is attributable to a device and ordered. This is a _product_ capability, not a debugging afterthought.

**CRDT:** Yjs has a version/update history and an `UndoManager`, but at CRDT-operation granularity, not domain-event granularity, and opaque. It answers "what bytes changed" far better than "what did the user do to this Task on that day." Equivalent _domain_ time-travel would require maintaining a separate semantic event log anyway — i.e., reinventing Option B alongside the CRDT.

**Verdict:** event log wins on driver 1, the top driver. This alone is close to decisive for a knowledge-management product.

### 6.7 Query and projection cost

**Event log:** reads come from the in-memory projected `Graph`; load pays an O(events) fold (ms at personal scale; snapshot cache deferred), and each commit pays O(delta) incremental projection. The indexed read-model epic (`canopy-c54`, closed) made queries index-assisted with a scan fallback, so query cost is not tied to a full scan.

**CRDT:** state is materialized directly in `Y.Map`s, so reads are direct with no projection step — a genuine advantage. But it is paid for with CRDT memory overhead and the loss of the derived-view flexibility (multiple projections, indexes, read models) that a separate projection layer gives.

**Verdict:** CRDT has a narrow read-latency edge; event log's projection layer buys flexibility (indexes, read models, deltas for reactive views) that the product actually uses. Net advantage: event log for this codebase.

---

## 7. The deferred children, as built vs. how Yjs would have handled them

The task asked whether each of `.2`/`.3`/`.4` is easier, harder, or infeasible under event-sourcing vs. Yjs.
Since all three shipped, this is reported as-built with a Yjs counterfactual.

### 7.1 `canopy-1q5.3` — `@canopy/storage-file` (on-disk event log)

**As built (event log):** _easier._
The on-disk format _is_ the event log — per-device JSONL segments plus a manifest.
The single-device write path is "append events to my own folder"; the file format doubles as the sync artifact.
No serialization of a separate materialized view; the view is rebuilt on load.

**Yjs counterfactual:** _harder and lossier._
You would persist opaque `Y.encodeStateAsUpdate` blobs.
They are not human-readable, not greppable, not diff-friendly, and not portable to the SQLite/HTTP backends without a Yjs runtime on both ends.
You would still want a semantic history, which Yjs's own update log does not cleanly provide — so you would likely end up writing events _next to_ the CRDT blob.

### 7.2 `canopy-1q5.4` — multi-device ingest over a replicated folder (Drive/Dropbox)

**As built (event log):** _easier — this is the headline result._
`reconcile` needs no conflict code at all: single-writer-per-device folders make file conflicts impossible; per-device watermarks are the entire reconciliation protocol; out-of-order and partial delivery are absorbed by the convergence invariant; cross-device referential gaps are absorbed by the pending buffer.
The LWW/tombstone/additive rules live in projection, so the transport is dumb.

**Yjs counterfactual:** _harder, and for the wrong problem._
Yjs merge would converge two devices' docs — but over a file-sync transport you would be merging whole encoded-state blobs written minutes apart, which is exactly the scenario where CRDT's fine-grained merge is overkill.
You would still need the single-writer-folder discipline to avoid file-level clobbering, so you inherit the event-log transport design _and_ carry the CRDT.
The one thing Yjs would buy — automatic merge of two devices editing the same block offline — is precisely the loss the 2026-07-03 doc consciously accepted as acceptable for a personal system.

### 7.3 `canopy-1q5.2` — `@canopy/storage-http` (server-persisted event log)

**As built (event log):** _easier._
The server is a dumb event carrier: `appendEvents`/`getEvents` over the wire, dedup by eventId server-side, no conflict logic, no replay logic, no graph understanding.
The convergence invariant means the client reconciles; the server just stores.

**Yjs counterfactual:** _harder._
A CRDT sync server (`y-websocket`-style) has to understand the CRDT update protocol, manage awareness, and often run a relay with its own state.
The event-log HTTP backend is a REST endpoint over an append-only table.

**Summary:** for all three, event-sourcing was _easier_ than Yjs would have been, and in `.4` — the multi-device offline-sync case that is supposedly the CRDT sweet spot — it was dramatically easier. None was infeasible; the reverse.

---

## 8. Decision and verdict

**The no-CRDT decision holds, and is now more strongly supported than when it was made.**

When the decision was taken (2026-07-03), the multi-device eventual-sync case was a design on paper.
As of 2026-08-12 it is shipped code (`canopy-1q5.2/.3/.4`, epic `canopy-1q5` closed), and it required _no CRDT and no conflict-resolution transport logic_ — the projection-layer LWW rules plus per-device single-writer folders were sufficient.
The revision-token hardening (`canopy-zm3`) closed the one concrete correctness gap the model had (same-millisecond concurrency collisions) without introducing vector clocks or CRDT machinery — a branded monotonic eventId-max token was enough.
On the top decision drivers — auditability, portability, debuggability, and domain validity under merge — the event log wins outright; on the one driver a CRDT would win (real-time multi-writer collaboration) Canopy has deliberately chosen not to compete.

Reintroducing a CRDT today would add a large dependency, an opaque binary persistence format, and a merge model that guarantees convergence but not domain validity — to serve a use case the product does not have.

### 8.1 The one scenario that would tip it back — and the signal to watch

There is exactly one concrete scenario that would justify revisiting: **real-time, multi-writer, character-level collaborative editing of the same content property** (Google-Docs-style: two or more cursors in the same block, sub-second convergence, presence).

This is the scenario the original sync doc carved out and the 2026-07-03 doc preserved a re-entry point for.
If it becomes a goal, the response is **Option C, not Option A**: a text CRDT returns as a per-property `crdt-text` merge strategy layered on the event log, _not_ as a replacement backbone.
Events would carry opaque CRDT deltas for such properties; projection would dispatch to the declared merge instead of LWW; the event log, history, portability, and validation all stay.
The per-property last-writer tracking in `incremental-projection.ts` is already shaped for this.

**Observable signals that should trigger revisiting (all three must hold):**

1. A real-time transport exists or is being built (WebSocket/LAN push) — not the current file-sync-every-few-minutes model. Character-level CRDT is pointless without sub-second replication.
2. Concurrent editing of the _same_ block by multiple writers is an actual product requirement — i.e., Canopy has stopped being single-user-multi-device and become multi-user-collaborative.
3. Block-level LWW loss is a _felt, recurring_ problem: users are observably losing edits on merge, and "the losing text is in history, go recover it" is no longer an acceptable answer.

Until all three are true, the event log remains the source of truth and no CRDT is warranted.
If they become true, scope the change to per-property merge (Option C) and cite this document's §3 and §8.1 rather than reopening the backbone decision.

Note: the parent bead `canopy-dra` is P2 and was flagged for an Opus-backed session precisely because it is a high-stakes revisit; this ADR is its resolution.

---

## 9. Consequences

- **No code change results from this ADR.** It is a decision record; the architecture is unchanged and validated.
- **Future proposals should cite this document** (specifically §8 and §8.1) instead of re-arguing CRDT-vs-event-log from scratch. That was the point of writing it.
- **Documentation debt surfaced:** `docs/architecture/bounded-contexts.md` still describes "six packages" and omits `@canopy/storage-file` and `@canopy/storage-http`, and project memory still lists `canopy-1q5.2/.3/.4` as open/deferred. Both should be corrected to reflect that the epic closed 2026-07-21. Filed as a follow-up; not fixed here to keep this change documentation-only and single-purpose.
- **The Option C re-entry point remains a deliberate, load-bearing part of the design.** Do not let a future cleanup remove the per-property merge-strategy shaping in `incremental-projection.ts` on the grounds that "only LWW is used" — that shaping is what keeps the one legitimate CRDT scenario cheap to serve later.
- **Log compaction/snapshotting stays an open question** (event-system doc §9, storage doc §4), independent of this decision. It is a scaling concern, not a CRDT concern; a CRDT would not have avoided it.
