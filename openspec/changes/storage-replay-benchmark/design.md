# Design: Storage Event Log Replay Load Test (50k Events)

## Context

Canopy relies on event-sourcing as the sole persistence and synchronization mechanism. All state transformations in `@canopy/graph` are derived by replaying `GraphEvent` streams stored in `EventLogStore` implementations (`SQLiteEventLog` and `IndexedDBEventLog`).
As user graphs grow over time, event logs accumulate tens of thousands of events. Fast initialization requires low-latency event retrieval and memory-efficient batch processing.

## Proposed Architecture

1. **Synthetic Event Stream Generator**:
   - Generates batches of `GraphEvent` objects (combination of `NodeCreated`, `EdgeCreated`, and `NodePropertiesUpdated`).
   - Uses deterministic `eventId` ordering (monotonic timestamps / UUIDv7) to simulate realistic append sequences.

2. **SQLite Benchmark Suite (`sqlite-replay.load.test.ts`)**:
   - Tests `appendEvents` in batch chunks (e.g., 5,000 events per transaction) up to 50,000 events total.
   - Benchmarks `getEvents(graphId)` full replay retrieval latency for 50k events.
   - Benchmarks query options (`after`, `before`, `limit`, `reverse`) over 50k indexed SQLite records.
   - Evaluates `GraphSession.load()` fold time on the replayed 50k event log.

3. **IndexedDB Benchmark Suite (`indexeddb-replay.load.test.ts`)**:
   - Benchmarks `appendEvents` put operations into IndexedDB object store up to 50k events.
   - Benchmarks `getEvents(graphId)` using `IDBKeyRange.bound` scanning over 50k items.
   - Measures memory footprint and range retrieval timing under `fake-indexeddb` environment.

## Performance SLAs

- **SQLite 50k Append Throughput**: 50,000 events batch appended in < 5.0 seconds.
- **SQLite 50k Replay Retrieval**: 50,000 events fetched via `getEvents` in < 2.5 seconds.
- **IndexedDB 50k Replay Retrieval**: 50,000 events fetched via `getEvents` in < 4.0 seconds.
- **50k Event GraphSession Cold-Start Fold**: Cold fold of 50k events into `GraphSession` state in < 5.0 seconds.

## Adversarial review and mitigations

### 1. Resource and Performance Overhead
- **Risk**: Allocating 50,000 full `GraphEvent` objects in JS heap memory during test execution can trigger high V8 garbage collection overhead or OOM errors in constrained CI environments.
- **Mitigation**: Construct event streams iteratively or using chunked generators during `appendEvents`. In test assertions, measure execution times using `performance.now()` after forcing garbage collection or keeping batch allocations scoped.

### 2. Failure Modes and Edge Cases
- **Risk**: SQLite WebAssembly (`sql.js`) memory allocation overflow when writing 50k events in a single massive uncommitted transaction or returning 50,000 parsed JSON payloads at once.
- **Mitigation**: Batch append operations in chunks of 5,000 events within transactions. Benchmark both full-stream fetch and chunked/paginated fetch via `limit` and `after` cursor pagination.

### 3. Security and Isolation
- **Risk**: Test artifacts or SQLite database state leaking across test runs or polluting global IndexedDB instances in node/bun test environment.
- **Mitigation**: Each benchmark creates isolated, transient in-memory SQLite database instances (`new SQL.Database()`) and unique IndexedDB store names (`canopy-events-bench-${timestamp}`) cleaned up in `afterEach`/`afterAll`.

### 4. Migration and Backward Compatibility
- **Risk**: Introducing benchmark fixtures could accidentally break existing storage contract interface definitions or change runtime event serialization.
- **Mitigation**: Benchmark suites only import the public `EventLogStore` interface and `createSQLiteEventLog` / `createIndexedDBEventLog` factory functions. No internal storage schemas or graph kernel types are modified.
