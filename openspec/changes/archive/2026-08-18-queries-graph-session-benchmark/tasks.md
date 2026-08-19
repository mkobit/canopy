- [x] 1. Create synthetic query benchmark fixture generator `generateQueryBenchmarkFixture` in `packages/queries/tests/fixtures/query-benchmark-fixture.ts`
- [x] 2. Implement initial `GraphSession` fold projection performance benchmark for 10k nodes in `packages/queries/scripts/bench-query-projection.ts`
- [x] 3. Implement query engine execution benchmarks for `node-scan`, `filter`, `traversal`, `sort`, `limit`, and `project` steps in `packages/queries/scripts/bench-query-projection.ts`
- [x] 4. Implement incremental re-projection latency benchmark for single and batch event commits in `packages/queries/scripts/bench-query-projection.ts`
- [x] 5. Run full test gate (`bun test`) and verify all assertions pass cleanly

Landed via PR #424, but shipped as a `bun test`-gating file (`tests/query-session-projection.load.test.ts`) with single-sample wall-clock `expect(duration).toBeLessThan(N)` assertions — task 5 was never actually run to completion, and the design's own accepted mitigation for flaky CI timing (median/p95 over repeated samples, see design.md's "Adversarial review" §2) was never implemented.
Reproduced as `canopy-8hw`: 21-24s against a 20s SLA on an idle dev machine, 50s+ under load.
Fixed by moving the whole suite to `packages/queries/scripts/bench-query-projection.ts`, a non-gating benchmark script (median/p95 over N repeated samples, printed not asserted) matching the existing `packages/graph/scripts/bench-index-maintenance.ts` pattern — not wired into `bun test` or CI.
Correctness coverage for `GraphSession`/`executeQuery` already exists at small deterministic scale in `graph-session.test.ts`, `query.test.ts`, and `engine.equivalence.property.test.ts`.
