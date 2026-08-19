## Why

As Canopy scales to support larger knowledge graphs (10,000+ nodes and 20,000+ edges), `@canopy/queries` query execution and `GraphSession` query projection performance must remain fast, deterministic, and scalable.
Currently, query engine tests operate on small graphs (<100 nodes). We need dedicated layer-isolated benchmarks and load tests for `@canopy/queries` over `GraphSession` projected state to validate query latency, incremental projection throughput, and memory bounds under 10k+ node workloads without introducing storage adapter dependencies.

## What Changes

- **Synthetic query benchmark fixture generator**: Implement `generateQueryBenchmarkFixture(options)` in `packages/queries/tests/fixtures/query-benchmark-fixture.ts` producing configurable synthetic graph topographies (nodes, edges, properties, multi-hop trees) and equivalent `GraphEvent[]` streams.
- **Layer-isolated query projection load test suite**: Create `packages/queries/tests/query-session-projection.load.test.ts` to measure and assert performance thresholds under 1,000, 5,000, and 10,000+ node scales.
- **Query step performance metrics**: Measure latency budgets for `node-scan`, `filter`, `traversal`, `sort`, `limit`, `project`, and stored view definitions.
- **Incremental projection latency tracking**: Measure `GraphSession` re-projection overhead when committing single events and batch updates to a 10k-node graph.

## Capabilities

### New Capabilities

- `query-session-projection-load-test`: Layer-isolated benchmark and load test suite for `@canopy/queries` and `GraphSession` query projection under 10k+ nodes.

### Modified Capabilities

- None (no changes to `@canopy/queries` runtime APIs or public signatures).

## Impact

- `packages/queries/tests/fixtures/query-benchmark-fixture.ts`: Synthetic fixture generator for query benchmarks.
- `packages/queries/tests/query-session-projection.load.test.ts`: Co-located load test suite for query execution and projection performance.
