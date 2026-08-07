## Context

The query executor (`packages/queries/src/engine.ts`) is a step interpreter over the in-memory projected `Graph`.
Every step materializes `[...graph.nodes.values()]` or `[...graph.edges.values()]` and filters it: `node-scan` scans all nodes, and `traversal` scans **all edges once per hop**.
There is no index and no reuse across calls in a turn.

Benchmark `canopy-c54` (not yet merged to any doc) measured this against synthetic graphs.
Flat typed filters stay cheap to 50k nodes (3.8ms).
Traversal (2-3 hops) and sort+limit bend around ~10k nodes and reach 20-30ms/call by 50k nodes.
Per-call overhead does not compound on its own, but with no index a burst of small queries in one turn scales linearly with graph size — a 50-query agent turn (query engine doc §1, §7 makes agents a first-class consumer) crosses ~100ms perceptible latency around 25-30k nodes.
This is the evidence trigger, not a hypothetical.

Two facts about the current codebase shape the design:

1. There is already a working read-model index precedent.
   `packages/graph/src/indexes.ts` defines `GraphIndexes` (settings / view lookups), hangs it off `graph._indexes`, and maintains it inside the projection fold via `incrementalUpdateIndexes` (`packages/graph/src/incremental-projection.ts`).
   It is a pure derivation of graph state that already rides the convergence guarantees.
2. The event-log design (`docs/design/2026-07-03-event-log-storage-and-sync.md`) makes the projected in-memory `Graph` the read model and the event log the only persisted truth.
   Its convergence invariant `incremental(shuffle(E)) === projectGraph(sort(E))` is the contract any derived index must not break.

The query engine doc (`docs/design/2026-02-08-query-engine.md`) already frames indexing as a storage-engine concern (§6) and floats native push-down for GQL-capable engines (§4, §5, §7).
This change makes the read side concrete while keeping that push-down door open.

## Goals / Non-Goals

**Goals:**

- Give the executor an indexed read model so `node-scan` by type is O(matched), `traversal` is O(matched × degree) instead of O(|E|) per hop, and the scanned set fed to `sort`/`limit` shrinks proportionally.
- Define the read model as a **port** in `@canopy/graph`, so the in-memory index today and a native/SQL backend tomorrow are interchangeable behind one contract.
- Reuse the existing incremental-projection fold and its convergence guarantee, so no second projection engine and no second convergence proof are introduced.
- Preserve `executeQuery`'s signature and `QueryResult` shape; behavior is identical except speed.
- Keep the pipeline IR canonical so the future GQL parser inherits indexing without change.

**Non-Goals:**

- Switching `apps/web` off `@canopy/storage-indexeddb` — orthogonal, explicitly out of scope (Decision 5).
- Building the SQL-backed Tier 2 read model — designed for, deferred (Decision 6).
- Sorted/ordered indexes that accelerate `sort` directly — deferred (Decision 7); this change shrinks sort input via type/adjacency indexes but does not maintain ordered structures.
- Implementing the GQL parser (`packages/queries/src/cypher.ts` stays a stub); this change only ensures it would inherit indexing.
- Query permissions, quotas, and rate limiting (query engine doc §7) — a separate concern.

## Decisions

### Decision 1: The read model is a port in `@canopy/graph`, not a concrete store

The read model is an interface exposing index-shaped primitives plus an optional push-down hook, shaped roughly as:

- `typedNodeIds(type): Iterable<NodeId>` — the type index.
- `neighbours(nodeId, edgeType, direction): Iterable<NodeId>` — the adjacency index.
- `nodesWhereEquals(property, value, type?): Iterable<NodeId>` — the property-equality index.
- `tryExecutePipeline(query): Result<QueryResult, Error> | NotCovered` — the optional whole-pipeline push-down hook.

The primitives cover the benchmarked hot paths; `tryExecutePipeline` is the reversibility hook.
An in-memory backend returns `NotCovered` and the executor composes primitives; a native backend (Tier 2) can implement `tryExecutePipeline` to push the whole pipeline down and bypass the interpreter — which is the only sane shape for a SQL/WASM backend where round-tripping ID sets across the boundary per step would dominate.

- **Rationale**: this is the reversible decision (architect rule 4). It lets the in-memory index solve the measured problem now while making the query engine doc's push-down direction a drop-in later, with no executor rewrite.
- **Alternatives**: (a) hard-wire the executor to the in-memory index — rejected, it would need rewriting when a native backend arrives. (b) Compile the IR directly to SQL now — rejected, it forces the SQL backend and its WASM/persistence costs into the hot path before the in-memory index (which the benchmark says is sufficient) is even tried.
- **Invariant check**: the port lives in `@canopy/graph`, which stays a dependency-free leaf (invariant 1), exactly like the existing `EventLogStore` port.

### Decision 2: First implementation is in-memory indexes extending `GraphIndexes`

Add three fields to `GraphIndexes`:

- **Type index**: `ReadonlyMap<TypeId, ReadonlySet<NodeId>>`.
- **Adjacency index**: per node, outbound and inbound neighbours bucketed by edge type — enough to answer `neighbours(node, edgeType, direction)` without touching unrelated edges.
- **Property-equality index**: `(property, value) -> Set<NodeId>`, built only for a bounded set of indexable properties (see Decision 4), keyed to allow an optional type narrowing.

These store **IDs only**, never entity copies; callers resolve IDs to the already-immutable `Node`/`Edge` in the graph.

- **Rationale**: extend a proven pattern rather than invent a parallel one. `GraphIndexes` already proves that a derived index maintained in the fold is correct and immutable-friendly. The type and adjacency indexes attack exactly the benchmarked bottlenecks (typed scan, per-hop full-edge scan).
- **Alternatives**: a separate index module decoupled from `GraphIndexes` — rejected as duplicate machinery (two lazy-build/incremental-update contracts to keep in sync).

### Decision 3: Maintain the index in the projection fold, in O(delta), at the same site as graph mutation

Index maintenance hooks into `applyOneEvent` in `incremental-projection.ts`, where the graph is already mutated, and updates only the touched entries.
Crucially, it does **not** follow `incrementalUpdateIndexes`'s current "rebuild the whole thing on a config event" approach — that is acceptable for the tiny settings/view maps but would reintroduce O(V+E) per event for type/adjacency/property indexes.
For a `NodeCreated` it adds one type-index entry; for an `EdgeCreated`, two adjacency entries; for a `NodeDeleted` it removes the node's type entry and, driven by the **actual edges the cascade removed** (not the event alone), the corresponding adjacency entries; etc.

- **Rationale**: the write path stays proportional to the change, and correctness rides the existing `applyOneEvent` outcome, so tombstones, cascades, LWW, and the pending buffer are handled for free (parked events never reach `applyOneEvent`, so they never touch the index).
- **Alternatives**: rebuild-on-mutation (current `incrementalUpdateIndexes` style) — rejected, it defeats the purpose. Maintain the index outside the fold, driven by the change-notification delta the session already emits — rejected, it duplicates dependency/tombstone logic that `applyOneEvent` already has right.

### Decision 4: Bound the property-equality index; do not index everything

The benchmark shows flat property filters are cheap to 50k nodes, so an unbounded property index would spend memory and write cost on a non-problem.
Index only properties declared indexable, plus the structural fields queries key on most (`type`, and edge `source`/`target`, which the executor already special-cases in `applyFilter`).
Non-equality operators (`contains`, `starts-with`, `gt`, `lt`, …) are never index-backed here and always fall back to scan.

- **Rationale**: minimum index for the measured problem (architect rule 1, no astronautics). Type + adjacency are the load-bearing indexes; property-equality is a bounded add for settings/reference lookups.
- **Alternatives**: index all scalar properties — rejected, unjustified memory/write cost. Index nothing but type+adjacency — viable, but property-equality is cheap to bound and helps the frequent equality lookups in query engine doc §8.

### Decision 5: `apps/web` stays on the in-memory read model; do not switch to SQLite

`apps/web` keeps `@canopy/storage-indexeddb` (event log) + in-memory projection + the new in-memory index.
The index is a field on the `Graph` the app already holds; nothing about storage changes.

- **Rationale**: the benchmark says an in-memory index solves the perceptible-latency problem well past current vault sizes. Making `sql.js` the default read model would trade a solved problem for a new one: a ~1MB+ WASM payload and hundreds of ms of init on every page load, penalizing the common small-vault case (query engine doc treats indexing as an engine concern, not a mandate to move stores).
- **Alternatives**: default to SQLite-backed storage now — rejected as premature and a regression for small vaults. Leave the decision dangling — rejected, the task requires a call.

### Decision 6: SQL-backed read model is Tier 2, deferred, and lives in `@canopy/storage-sqlite`

When a graph outgrows in-memory indexing (or storage becomes remote), a native backend implements the same port — ideally the `tryExecutePipeline` push-down hook — and lives in `@canopy/storage-sqlite`, which already isolates `sql.js`.
A **new** package is not warranted: it would duplicate the exact dependency-isolation `@canopy/storage-sqlite` exists to provide.
One concrete caveat is recorded now so Tier 2 does not regress: `sql.js` holds the whole DB in memory and persists by exporting the entire image (`database.export()`, see `packages/storage-sqlite/src/sqlite-event-log.ts`), which is fine for a batch-appended event log but O(DB) per flush for a hot read model.
Tier 2 should therefore use an OPFS-backed SQLite VFS (official SQLite WASM or `wa-sqlite`) rather than `sql.js` whole-image export, and treat the SQL read model as a rebuildable projection with a checkpoint/watermark so it can be rebuilt from the log.

- **Rationale**: keeps the expensive, higher-risk path out of the 0.1.0 critical path while proving the port that makes it a drop-in.
- **Alternatives**: build Tier 2 now — rejected, no evidence it is needed and it carries the WASM/persistence/dual-write risks catalogued in the adversarial review. New package for the SQL read model — rejected, duplicates `sql.js` isolation.

### Decision 7: No second convergence proof; extend the existing property-based test

Because the index is a pure function of the projected graph (Decision 2/3), the event-log convergence invariant already guarantees the graph converges, and a pure derivation of a converged value converges.
The obligation is only to prove the derivation is pure and equals a from-scratch build.

- Extend the existing projection property-based test (event-log doc §4) with: `indexes(incremental(shuffle(E))) === buildFromScratch(projectGraph(sort(E)))`.
- Add a scan-vs-index equivalence property test: for random graphs and random queries, `indexedExecute(q) === scanExecute(q)` (the scan-only executor becomes the reference oracle).
- Add a dev-mode `verifyIndexes(graph)` that rebuilds from scratch and diffs, usable as an assertion in tests.

- **Rationale**: correctness of a derived index is the real risk (a wrong index returns wrong results silently, worse than a slow one); property tests against a scan oracle are the strongest cheap defense.
- **Alternatives**: a bespoke convergence proof for the index — rejected as redundant given purity.

## Risks / Trade-offs

Full analysis in the next section. Headline trade-offs:

- **[Trade-off]** Faster reads for a constant-factor slower, more memory-hungry write path (index maintenance per event) → bounded to O(delta) per event and IDs-only storage; the write path is already O(n)/event from Map cloning, so no new asymptotic class.
- **[Trade-off]** A new abstraction (the port) for reversibility → justified by the documented push-down direction; kept minimal (three primitives + one optional hook).
- **[Risk]** Index/graph divergence returns wrong results silently → property-based scan-oracle test + dev-mode `verifyIndexes`.

## Adversarial review and mitigations

### 1. Resource and performance overhead

- **[Risk]** Index memory footprint.
  Type, adjacency (out and in), and property-equality indexes add references on top of `graph.nodes`/`graph.edges`.
  - _Mitigation_: store IDs only, never entity copies; footprint is O(V + E) references plus O(indexed property cardinality), not a second copy of the graph. Bound the property index to declared-indexable properties (Decision 4) so it cannot blow up on high-cardinality free-text fields.
- **[Risk]** Incremental maintenance re-introducing O(V+E) on the write path.
  The existing `incrementalUpdateIndexes` rebuilds the whole `GraphIndexes` on any config event; applied naively to type/adjacency/property indexes that would make every mutation a full scan.
  - _Mitigation_: type/adjacency/property indexes MUST update in O(delta) per event inside `applyOneEvent` (add/remove single entries); the coarse rebuild stays only for the small settings/view maps where it is already acceptable. This is a hard implementation obligation, asserted by a test that fails if maintenance cost scales with graph size.
- **[Risk]** Immutability copy cost compounding.
  Invariant 6 forbids mutation, and the projection already clones `graph.nodes` per event (`new Map(graph.nodes)`); adding index-map clones per event multiplies a constant factor onto an already-O(n)/event write path.
  - _Mitigation_: accept the constant-factor increase (the write path's asymptotics are unchanged, and personal-vault write bursts are small); do not attempt persistent/HAMT maps in this change. File a follow-on to move both graph and index maps to structural-sharing maps if write throughput ever becomes the bottleneck — out of scope, and not indicated by any current benchmark (the benchmark measured reads).
- **[Risk]** WASM SQLite init cost if SQLite became the default read model.
  `sql.js` adds ~1MB+ WASM and hundreds of ms init on every page load.
  - _Mitigation_: do not make it the default (Decision 5); the in-memory index carries the common case with zero payload/init cost.

### 2. Failure modes and edge cases

- **[Risk]** Index/graph divergence returning **wrong** results silently (worse than slow).
  - _Mitigation_: property-based equivalence test with the scan-only executor as oracle (`indexedExecute(q) === scanExecute(q)`); property test `indexes(incremental(shuffle(E))) === buildFromScratch(...)`; dev-mode `verifyIndexes(graph)` assertion (Decision 7).
- **[Risk]** Cascade deletion leaving dangling adjacency entries.
  `NodeDeleted` cascades to every touching edge in `applyOneEvent`; if the adjacency index keys off the event alone it will miss cascade-removed edges.
  - _Mitigation_: drive index maintenance off the **actual** edges removed by the apply outcome, at the same site as the graph mutation, not off the event payload (Decision 3).
- **[Risk]** Out-of-order / pending-buffer events polluting the index.
  An `EdgeCreated` parked awaiting its endpoints must not appear in adjacency until it actually applies.
  - _Mitigation_: index updates happen only in `applyOneEvent`, after dependency satisfaction; parked groups live in the pending buffer and never reach it, and drained groups update the index exactly when they apply.
- **[Risk]** Unindexed predicate silently returning empty instead of falling back.
  Non-equality operators and unindexed properties have no index entry.
  - _Mitigation_: the read-model port returns an explicit "not covered" signal per step/predicate; the executor falls back to full scan for those, and the scan-oracle property test guarantees parity.
- **[Risk]** LWW property update changing an indexed value.
  A `NodePropertiesUpdated` that wins LWW on an indexed property must move the node between property-equality buckets (old value → new value).
  - _Mitigation_: property-index maintenance reads the pre-update value from the graph (available in `applyOneEvent` before the new node is written) and removes the stale bucket entry as it adds the new one; covered by the equivalence test including update-heavy event sets.

### 3. Security and isolation

- **[Risk]** New mutable surface breaking immutability guarantees (invariant 6).
  `GraphIndexes` currently deep-freezes cached setting values; new indexes must not expose mutable references.
  - _Mitigation_: indexes store IDs and resolve to the already-immutable `Node`/`Edge`; no new mutable value is cached, so nothing new needs freezing.
- **[Risk]** Cross-graph leakage.
  The read model must scope strictly to one graph, like the event log's per-`graphId` scoping.
  - _Mitigation_: the index is a field on a single `Graph` instance and is built only from that graph's nodes/edges; there is no shared/global index across graphs (the `WeakMap` cache in `indexes.ts` is keyed per `Graph` reference).
- **[Risk]** Query-driven resource exhaustion by an AI agent.
  Indexing changes the cost profile but a hub node with huge degree still yields large adjacency results, and a crafted burst can still be expensive.
  - _Mitigation_: out of scope to add quotas here (that is the query engine doc §7 permissions/quota concern), but the read model introduces **no new injection surface** — the pipeline IR is structured data, not string-interpolated. Record now that the deferred SQL Tier 2 backend MUST use parameterized statements so push-down never becomes a SQL-injection vector.

### 4. Migration and backward compatibility

- **[Risk]** Changing the shape of `graph._indexes`.
  It is currently an optional field populated via a `WeakMap` side channel with a cast-and-assign.
  - _Mitigation_: additive, optional fields on `GraphIndexes`; the field stays `_indexes?`, so any code path that never consults it keeps working via scan fallback. No consumer of `Graph` is forced to change.
- **[Risk]** Executor / result-shape compatibility.
  Consumers (renderers, stored queries in `packages/queries/src/stored.ts`, view resolution) depend on `executeQuery`'s contract.
  - _Mitigation_: signature `(graph, query) => Result<QueryResult, Error>` and `QueryResult` (nodes/edges/rows) are unchanged; the change is behavior-preserving except speed, enforced by the scan-oracle equivalence test.
- **[Risk]** No persisted read-model schema today, but Tier 2 would introduce one.
  A future SQL read model adds an on-disk schema that must be versioned and rebuilt when it changes.
  - _Mitigation_: Tier 1 has nothing to migrate (the in-memory index is rebuilt from the event log on every load; pre-1.0, zero vaults per `project_pre_release_status`). Explicitly assign the schema-versioning + rebuild-from-log obligation to Tier 2 (Decision 6) so it is not silently incurred now.
- **[Risk]** Index-schema rebuild cost.
  If the in-memory index structure changes across a future version, it is rebuilt by a full graph scan (`buildGraphIndexes`).
  - _Mitigation_: rebuild is O(V+E), milliseconds at personal-vault scale (consistent with the event-log doc's "replaying thousands of events is milliseconds-scale"); it happens once at load, not per query. Acceptable and requires no data migration.

## Migration Plan

There is no data migration (the index is derived and in-memory; pre-1.0, zero vaults).
Rollout is behavior-preserving and reversible:

1. Add the read-model port and extend `GraphIndexes` with type/adjacency/property fields (kernel, additive).
2. Wire O(delta) maintenance into `applyOneEvent`; land the extended convergence property test and the from-scratch equivalence test.
3. Point the executor's `node-scan`/`traversal`/equality-`filter` at the read model with scan fallback; land the scan-oracle equivalence property test.
4. (Deferred, separate change) Tier 2 SQL/OPFS backend behind the same port via `tryExecutePipeline`.

Rollback: because the executor keeps scan fallback and `_indexes` is optional, disabling index consultation reverts to the current behavior without touching data.

## Open Questions

1. Exact set of "indexable" properties for the property-equality index (Decision 4): a fixed structural set (`type`, `source`, `target`) plus PropertyType-declared indexable flags, versus a small hardcoded allowlist for 0.1.0.
2. Whether `sort` warrants a maintained ordered index later, or whether shrinking the input set via type/adjacency indexes is sufficient through the sizes Canopy targets (deferred here; revisit if a benchmark shows sort dominating after type/adjacency land).
3. Whether the change-notification delta the `GraphSession` already emits should also carry index deltas for future live/reactive queries (event-log doc §3), or whether that is a separate reactive-query change.
4. Tier 2 trigger: the concrete graph size or storage-remoteness signal that justifies building the SQL/OPFS read model (needs a benchmark past in-memory viability).
