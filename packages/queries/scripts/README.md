# Queries benchmark scripts

## Overview

This directory contains `bench-query-projection.ts`, a standalone, non-gating CLI benchmark script that measures median and p95 latencies for `GraphSession` load/commit projection and `executeQuery` steps on a 10,000-node, 20,000-edge fixture.

## Interface

- None (standalone executable script with no public exports).

## Invariants

- `[bench-query-projection.ts:benchInitialLoad]`, `[bench-query-projection.ts:benchSingleCommit]`, `[bench-query-projection.ts:benchBatchCommit]`, `[bench-query-projection.ts:benchQuerySteps]` Throw `Error` if `session.load()`, `session.commit()`, or `executeQuery()` return `!ok` or fewer than `10_000` nodes.
- `[bench-query-projection.ts:main]` Calls `executeQuery()` once before timing to warm the lazy `Graph` read-model index cache; `[bench-query-projection.ts:percentile]` clamps computed index to `[0, sortedMs.length - 1]`.

## Side Effects

- `[bench-query-projection.ts:main]` Executes `await main()` at module top level, allocates in-memory `EventLogStore` / `GraphSession` instances, populates index caches, and prints formatted median/p95 stats to stdout via `console.log`.

## Verification

- Run: `bun test`
