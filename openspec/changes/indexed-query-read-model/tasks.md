## 1. Read-model port (kernel)

- [x] 1.1 Define the read-model port interface in `packages/graph/src/` — `typedNodeIds`, `neighbours`, `nodesWhereEquals`, and the optional `tryExecutePipeline` push-down hook returning a result or a `NotCovered` signal (design.md Decision 1).
- [x] 1.2 Extend `GraphIndexes` in `packages/graph/src/indexes.ts` with a type index, an adjacency index (outbound/inbound by edge type), and a bounded property-equality index — IDs only, never entity copies (Decision 2).
- [x] 1.3 Decide and document the indexable-property set for 0.1.0 (Open Question 1): structural fields (`type`, edge `source`/`target`) plus either a PropertyType-declared indexable flag or a small hardcoded allowlist (Decision 4).

## 2. Incremental maintenance (kernel)

- [x] 2.1 Wire O(delta) index maintenance into `applyOneEvent` in `packages/graph/src/incremental-projection.ts` for `NodeCreated`, `EdgeCreated`, `NodePropertiesUpdated` (LWW bucket move on indexed properties), `NodeDeleted` (including cascade edge removal), and `EdgeDeleted` — do not follow `incrementalUpdateIndexes`'s existing full-rebuild-on-config-event pattern (Decision 3).
- [x] 2.2 Verify pending-buffer/parked events never update the index until they actually apply, and that cascade deletion drives index cleanup off the actual removed edges, not the event payload (Decision 3; adversarial review §2).
- [x] 2.3 Extend the existing projection convergence property-based test with `indexes(incremental(shuffle(E))) === buildFromScratch(projectGraph(sort(E)))` (Decision 7).
- [x] 2.4 Add a dev-mode `verifyIndexes(graph)` assertion that rebuilds indexes from scratch and diffs against the incrementally-maintained state (Decision 7; adversarial review §2).
- [x] 2.5 Add a maintenance-cost regression test asserting index update cost scales with event delta, not graph size (adversarial review §1, "hard implementation obligation").

## 3. Executor integration (`@canopy/queries`)

- [x] 3.1 Update `node-scan`, `traversal`, and equality `filter` step handling in `packages/queries/src/engine.ts` to consult the read-model port, falling back to full scan for any step/predicate the port reports as not covered (non-equality operators, unindexed properties).
- [x] 3.2 Preserve `executeQuery`'s signature `(graph, query) => Result<QueryResult, Error>` and `QueryResult` shape exactly — no changes required in any consumer (renderers, `packages/queries/src/stored.ts`, view resolution).
- [x] 3.3 Add a scan-vs-index equivalence property test: for random graphs and random queries, indexed execution and scan-only execution return equal result sets (Decision 7).

## 4. Verification and rollout

- [x] 4.1 Run `bun test`, `bun run typecheck`, `bun run lint`, `bun run build` across `@canopy/graph`, `@canopy/queries`, and downstream consumers (`apps/web`, `apps/cli`) — confirm the change is behavior-preserving.
- [x] 4.2 Confirm rollback path: index consultation can be disabled (or `_indexes` left unpopulated) and the executor falls back to current scan behavior with no data changes required.
- [x] 4.3 Update `docs/design/2026-02-08-query-engine.md` to note the read-model port now exists and reference this change, so the doc's own drift (flagged during `canopy-aj2`) doesn't compound further.

Not in this change's scope (see design.md Non-Goals): switching `apps/web` off `@canopy/storage-indexeddb`, building the Tier 2 SQL-backed read model, ordered/sorted indexes, and the GQL parser itself.
