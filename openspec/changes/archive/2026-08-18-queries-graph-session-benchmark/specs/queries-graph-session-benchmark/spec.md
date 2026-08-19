## ADDED Requirements

### Requirement: Query session projection benchmark under 10k+ nodes

`@canopy/queries` SHALL provide a layer-isolated, non-gating benchmark script that measures `GraphSession` initial fold projection and query execution engine performance under 10,000+ nodes and 20,000+ edges, reporting median and p95 latency over repeated samples.
The benchmark SHALL NOT assert on wall-clock duration inside `bun test` — a single wall-clock sample is not a deterministic correctness signal, and asserting on it inside the CI/pre-merge test gate produces flaky failures under shared-machine or CI-runner contention (`canopy-8hw`).

#### Scenario: GraphSession fold projection performance under 10k nodes

- **GIVEN** an `EventLogStore` containing 10,000 node creation events and 20,000 edge creation events generated deterministically
- **WHEN** a `GraphSession` is initialized over the event log, repeated across multiple samples
- **THEN** the benchmark script SHALL report median and p95 fold-projection latency without failing the run

#### Scenario: Query engine node scan and property filter under 10k nodes

- **GIVEN** a `GraphSession` populated with 10,000 nodes and 20,000 edges
- **WHEN** a `Query` with `node-scan` and `filter` steps is executed against the projected graph, repeated across multiple samples
- **THEN** the benchmark script SHALL report median and p95 query execution latency without failing the run

#### Scenario: Query engine 1-hop traversal under 10k nodes and 20k edges

- **GIVEN** a `GraphSession` populated with 10,000 nodes and 20,000 edges
- **WHEN** a `Query` with `traversal` steps is executed from a set of starting nodes, repeated across multiple samples
- **THEN** the benchmark script SHALL report median and p95 traversal latency without failing the run

#### Scenario: Incremental re-projection performance under mutation

- **GIVEN** an active `GraphSession` containing 10,000 nodes
- **WHEN** single-event and 100-event batch property updates are committed to the session, repeated across multiple samples
- **THEN** the benchmark script SHALL report median and p95 re-projection latency without failing the run
