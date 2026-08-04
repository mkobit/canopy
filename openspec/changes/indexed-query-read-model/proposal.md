## Why

The query executor (`packages/queries/src/engine.ts`) brute-force scans the in-memory `Map<NodeId, Node>` / `Map<EdgeId, Edge>` on every step, with no indexing and no scan reuse.
Benchmark `canopy-c54` shows no algorithmic cliff but linear scan cost: traversal (2-3 hops) and sort+limit bend around ~10k nodes, and a 50-query agent turn crosses ~100ms perceptible latency at 25-30k nodes because each call re-scans the whole graph.
As Canopy approaches 0.1.0 and AI/agentic workflows become a first-class consumer (query engine doc §1, §7), the read side needs a real indexed read model that the executor consults instead of re-scanning.

## What Changes

- Introduce a **read-model port** in `@canopy/graph` that exposes index-shaped lookups (typed node IDs, adjacency by edge type/direction, property-equality) plus an optional whole-pipeline push-down hook.
- Ship the **first read-model implementation as in-memory indexes** maintained inside the existing incremental-projection fold, extending the proven `GraphIndexes` / `graph._indexes` pattern (`packages/graph/src/indexes.ts`) with a type index, an adjacency index, and a bounded property-equality index.
- Rewrite the executor's `node-scan`, `traversal`, and equality `filter` steps to consult the read model, **falling back to full scan** for any step the read model does not cover, preserving current result semantics exactly.
- Keep the pipeline IR (`node-scan | edge-scan | filter | traversal | sort | limit | project`) as the canonical execution unit; the future GQL parser (`packages/queries/src/cypher.ts`) compiles to the same IR and inherits indexing for free.
- Extend the existing projection property-based test to assert the index is a pure derivation of graph state, so **no second convergence proof is required**.
- Document a **deferred Tier 2 SQL-backed read model** behind the same port as the concrete form of the query engine doc's "native query push-down" direction (§4, §5, §7) — designed for, not built here.

Not in scope (see design non-goals): switching `apps/web` off `@canopy/storage-indexeddb`, building the SQL read model, sorted/ordered indexes for `sort` acceleration, and the GQL parser itself.

## Capabilities

### New Capabilities

- `indexed-read-model`: a read-model abstraction the query executor targets instead of re-scanning the graph, with an in-memory indexed implementation derived from the incremental projection and a documented push-down extension point for native backends.

### Modified Capabilities

<!-- None. The query engine has no existing openspec capability; QueryResult and executeQuery contracts are unchanged (behavior-preserving except speed). -->

## Impact

- `@canopy/graph`: adds the read-model port and extends `GraphIndexes` (type / adjacency / property-equality indexes) with O(delta) incremental maintenance in `incremental-projection.ts`; stays a dependency-free leaf (invariant 1).
- `@canopy/queries`: `executeQuery` consults the read model; signature `(graph, query) => Result<QueryResult, Error>` and `QueryResult` shape unchanged.
- `@canopy/storage-sqlite`: identified as the home for the deferred Tier 2 SQL read model (it already depends on `sql.js`); no code change in this proposal.
- `apps/web`: no change — it keeps the IndexedDB event log plus in-memory projection; the indexed read model rides along with the `Graph` it already holds.
- Testing: extends the projection convergence property-based test; adds a scan-vs-index equivalence property test.
