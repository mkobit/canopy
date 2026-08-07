# Design: @canopy/queries GraphSession query projection benchmark (`canopy-pm0.1`)

## Context

Bead `canopy-pm0.1` under epic `canopy-pm0` (Core services and storage system-wide load testing).
As Canopy graph sizes grow, the query engine (`@canopy/queries`) and `GraphSession` projection in `@canopy/graph` must maintain sub-millisecond to low-millisecond query evaluation speeds and fast incremental re-projection.

This design focuses strictly on layer-isolated benchmarking and load testing of `@canopy/queries` over `GraphSession` without storage adapter I/O overhead (which is isolated in sibling task `canopy-pm0.2`).

## Goals & non-goals

### Goals

- Create synthetic query benchmark fixture generator `generateQueryBenchmarkFixture(options)` in `packages/queries/tests/fixtures/query-benchmark-fixture.ts`.
- Implement co-located load test suite `packages/queries/tests/query-session-projection.load.test.ts`.
- Benchmark `GraphSession` initial fold projection across 1k, 5k, and 10k+ node event streams.
- Benchmark query execution latency ($T_{query}$) across pipeline step types:
  - `node-scan` + `filter` ($T < 15\text{ms}$ at 10k nodes)
  - `traversal` ($T < 25\text{ms}$ across 20k edges at 10k nodes)
  - `sort` + `limit` + `project` ($T < 10\text{ms}$ at 10k nodes)
- Benchmark incremental re-projection latency when committing single and batch events into an existing 10k-node `GraphSession`.
- Ensure heap memory allocation remains bounded and garbage-collectable.

### Non-goals

- SQLite or IndexedDB storage disk/adapter replay benchmarks (tracked in `canopy-pm0.2`).
- CLI IPC socket streaming load tests (tracked in `canopy-pm0.3`).
- React UI canvas rendering load tests (tracked in `canopy-gtv.2.3`).

## Decisions

### Decision 1: Synthetic Fixture Generator API

Synthetic fixtures generate deterministic node and edge graphs with scalable property payloads:

```ts
export interface QueryBenchmarkFixtureOptions {
  readonly nodeCount: number;
  readonly edgeDensity?: number; // average outgoing edges per node (default: 2)
  readonly propertyCount?: number; // properties per node (default: 4)
  readonly clusterCount?: number; // number of connected sub-clusters (default: 5)
}

export interface QueryBenchmarkFixture {
  readonly graph: Graph;
  readonly events: readonly GraphEvent[];
  readonly sampleNodeIds: readonly NodeId[];
  readonly sampleEdgeTypes: readonly EdgeTypeId[];
}

export function generateQueryBenchmarkFixture(
  options: QueryBenchmarkFixtureOptions,
): QueryBenchmarkFixture;
```

### Decision 2: Layer-Isolated In-Memory EventLogStore

To isolate `@canopy/queries` and `@canopy/graph` performance from filesystem or browser storage engine variances, load tests run against `MemoryEventLogStore` from `@canopy/storage`.

### Decision 3: SLA & Budget Assertions

The load test suite enforces latency budget assertions in Bun's test runner:
- Initial 10k node projection: $< 250\text{ms}$
- 10k node-scan + property filter: $< 15\text{ms}$
- 10k node 1-hop traversal (across 20k edges): $< 25\text{ms}$
- Single property update commit + re-projection: $< 2\text{ms}$

## Technical implementation details

### Test File Location

The benchmark test file lives at [`packages/queries/tests/query-session-projection.load.test.ts`](file:///home/mkobit/workspace/mkobit/canopy/packages/queries/tests/query-session-projection.load.test.ts).

### Performance Measurement Standard

Microsecond precision using `performance.now()` with warm-up runs (3 iterations) followed by measured runs (10 iterations) to report minimum, average, and 95th percentile ($p95$) latency figures.

## Adversarial review and mitigations

### 1. Resource and performance overhead

- **Risk**: Allocating 10,000+ synthetic node objects and 20,000+ edge objects in a single test file could increase memory pressure in CI test runs, leading to GC pauses or out-of-memory errors.
- **Mitigation**: Fixture objects are constructed deterministically without holding global or module-scoped references. Garbage collection can reclaim fixture memory between test suites. Fixture generation is capped to 10k nodes in standard test runs, with an optional environment flag (`CANOPY_LOAD_TEST_SCALE=50000`) for extended stress runs.

### 2. Failure modes and edge cases

- **Risk 1**: Flaky test failures in CI due to background CPU throttling or shared runner noise causing transient timing spikes above fixed millisecond thresholds.
- **Mitigation**: Latency assertions compare median/$p95$ of 10 runs rather than single-run max latency, and use generous fallback bounds (2.5x buffer) in CI environments.
- **Risk 2**: Deep traversal queries (e.g. multi-hop recursive or cycle-heavy graphs) causing call stack overflow or infinite loops during benchmark execution.
- **Mitigation**: `generateQueryBenchmarkFixture` produces directed acyclic graphs (DAGs) by default, and query engine traversal steps enforce visit tracking (`Set<NodeId>`) to prevent cyclic infinite loops.

### 3. Security and isolation

- **Risk**: Fixture data generation introducing unhandled scalar types or non-serializable objects into `GraphSession` domain state.
- **Mitigation**: All generated node/edge properties validate strictly against `@canopy/graph` Zod schemas (`PropertyValueSchema`) prior to event creation.

### 4. Migration and backward compatibility risks

- **Risk**: Adding load test files breaks build or linting scripts due to typechecking or dist artifact resolution issues.
- **Mitigation**: Load test files follow the `.load.test.ts` naming pattern under `packages/queries/tests/` and are included in `tsconfig.check.json` without modifying build entry points or package exports.
