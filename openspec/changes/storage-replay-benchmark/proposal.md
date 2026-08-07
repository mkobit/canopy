## Why

To guarantee Canopy's graph storage sub-system can handle continuous event ingestion and cold-start state reconstruction at scale, `@canopy/storage-sqlite` and `@canopy/storage-indexeddb` must be benchmarked and load-tested under high event volumes.
Currently, unit tests for storage adapters operate on small event streams (<10 events). We need dedicated performance benchmarks measuring 10,000, 25,000, and 50,000 event append and replay cycles to establish throughput, memory bounds, and latency budgets for persistent event log stores.

## What Changes

- **Synthetic Event Stream Benchmark Generator**: Create a reusable event stream generator in storage test utilities to generate deterministic, schema-compliant `GraphEvent` batches up to 50,000 events.
- **SQLite Storage Replay Benchmark Suite**: Implement `packages/storage-sqlite/tests/sqlite-replay.load.test.ts` to measure insertion throughput (events/sec), full event query/replay latency, and paginated replay under 50k events.
- **IndexedDB Storage Replay Benchmark Suite**: Implement `packages/storage-indexeddb/tests/indexeddb-replay.load.test.ts` (using `fake-indexeddb` or in-memory IndexedDB backend) to benchmark `appendEvents` and `getEvents` replay under 50k events.
- **GraphSession Cold-Start Replay Integration Benchmark**: Measure total cold-start graph materialization time when loading a 50k-event stream into `GraphSession` from persistent storage.

## Capabilities

### New Capabilities

- `storage-replay-benchmark`: System-wide load test suite for `@canopy/storage-sqlite` and `@canopy/storage-indexeddb` event log replay under 50,000 events.

### Modified Capabilities

- None (runtime signatures and persistent storage contracts in `@canopy/storage-sqlite` and `@canopy/storage-indexeddb` remain unchanged).

## Impact

- `packages/storage-sqlite/tests/sqlite-replay.load.test.ts`: Load benchmark for SQLite event log persistence and replay.
- `packages/storage-indexeddb/tests/indexeddb-replay.load.test.ts`: Load benchmark for IndexedDB event log persistence and replay.
