# History and time-travel as a product feature — direction

> Status: **draft** (product-direction capture; no code change, no tasks staged)
> Scope: framing event-log history/time-travel as an intentional user-facing feature; what the kernel already provides; the surfaces worth having; what must be decided before any of it is built
> Type: product direction
> Bead: `canopy-qkp`
> Depends on: [2026-02-08-event-system.md](2026-02-08-event-system.md), [2026-08-12-snapshot-and-lossless-export-discipline.md](2026-08-12-snapshot-and-lossless-export-discipline.md), `packages/graph/src/history.ts`

---

## 1. The claim

Full history and point-in-time reconstruction fall out of Canopy's event log for free.
Logseq's DB version — a mature, shipping competitor — has **no** general edit-history or time-travel: only a per-block task-status-history property and a 30-day page (not block) recycle bin, with no reconstruction of arbitrary past graph states ([research 2026-08-12](../research/2026-08-12-logseq-2.0-comparison.md), history axis).
So this is a real differentiator that is cheap _because the kernel primitive already exists_, and the direction to set now is: treat time-travel as an intentional product feature, not an accident of the architecture or a debug-only affordance.

This document is framing, not a UI spec.
Per the project's constrain-speculative-design rule, it captures intent, inventories what exists, and lists the decisions to make — it does not design the interface or stage implementation.

## 2. What the kernel already gives (today)

`packages/graph/src/history.ts`:

- `getGraphAt(store, graphId, target)` reconstructs the **full graph state** at a `target` of either `{ timestamp }` or `{ eventId }`, by reading events up to that point and projecting them.
- `TimeTravelTarget` is the two-shape target type; `maxEventIdForTimestamp` and `incrementEventId` handle the UUIDv7 bound arithmetic so a timestamp maps to an inclusive log cut.

This is a whole-graph, read-only, replay-based primitive.
It is enough to _reconstruct_ any past state; it is the foundation, not the feature.

## 3. What is missing between the primitive and a feature

- **Per-entity history.** `getGraphAt` rebuilds the entire graph; there is no "history of _this_ node/property" view or a node-scoped diff across two points.
- **Diff.** No structural diff between two graph states or two versions of one node (what changed, added, removed).
- **Restore.** No "restore to this point" flow. Restoring must itself be _new events_ (an append that re-establishes past values), never a mutation or truncation of the log — the log is append-only and is the source of truth ([snapshot/export discipline](2026-08-12-snapshot-and-lossless-export-discipline.md)).
- **Navigation surface.** No timeline/scrubber, no "what did this look like last Tuesday", no per-node activity feed.
- **Performance shape.** `getGraphAt` folds from the start each call; a real feature interacts with the deferred snapshot/fast-start work (storage-layer §4) and the compaction policy (event-system §9).

## 4. Candidate surfaces (breadth, not commitment)

Listed so the design space is on record; each is its own later change, none staged here.

- **Time scrubber / "as of" mode** — view the whole graph as of a timestamp or event (direct `getGraphAt`).
- **Per-node history** — the version timeline of a single node and its properties; needs the per-entity slice §3 lacks.
- **Diff view** — compare a node (or the graph) between two points; needs a diff function §3 lacks.
- **Restore** — re-apply a past value set as new events; append-only, auditable, reversible.
- **Activity feed** — recent events as human-readable changes; the lightest surface, closest to the raw log.

## 5. Decisions to make before building

1. **Guaranteed history window** — is time-travel unbounded, or bounded by a retention/compaction policy? This is one decision with compaction, not two: compaction must never silently shrink a window the product promises (snapshot/export discipline rule 7).
2. **Restore semantics** — confirm restore is always additive (new events re-establishing past state), never destructive; define what "restore a node" does to edges and children.
3. **Granularity** — whole-graph only (cheap, exists) vs. per-node/per-property history (needs new kernel read paths). Start whole-graph; add per-entity when a surface needs it.
4. **Performance dependency** — whether per-entity history needs indexed history reads or can ride the existing fold; ties to snapshot/fast-start (storage-layer §4).
5. **Scope discipline** — resist building all five surfaces at once; the activity feed and "as of" mode are the cheapest first proofs and reuse the existing primitive with no kernel change.

## 6. Sequencing

- P3, pre-1.0, no users yet — not urgent; this bead exists to make the direction intentional and to keep the primitive from being treated as debug-only.
- The first user-facing slice (likely "as of" mode or an activity feed) becomes its own OpenSpec change with adversarial review; per-entity history/diff/restore are subsequent changes.
- No tasks are staged from this document.

## 7. Consequences

- No code changes; records that time-travel is a deliberate differentiator built on `history.ts`, and the gap between the primitive and a feature.
- Couples explicitly to the [snapshot/export discipline](2026-08-12-snapshot-and-lossless-export-discipline.md): the promised history window and the compaction policy are decided together.
