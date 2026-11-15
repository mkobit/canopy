# Graph benchmark scripts

## Overview

This directory contains two standalone, non-gating CLI benchmark scripts (`bench-incremental-projection.ts` and `bench-index-maintenance.ts`) that measure wall-clock performance of `@canopy/graph` event projection and read-model index maintenance across graphs of 100 to 50,000 nodes.

## Interface

- None (standalone executable scripts; both invoke `main()` on module load).

## Invariants

- `[bench-incremental-projection.ts:buildSeededGraphAndState]` Pre-seeds graph indexes via `getGraphIndexes(graph)`; throws `Error` if `result.applied.length < 2` on dependency drain; caps batch merge repetitions at `Math.min(REPETITIONS, 50)` across `GRAPH_SIZES = [100, 1_000, 10_000, 50_000]`.
- `[bench-index-maintenance.ts:buildSeededGraph]` Pre-seeds `graph._indexes` via `getGraphIndexes(graph)` so `applyEvent` maintains indexes incrementally; uses unique `probe-status-${repetition}` values on `NodePropertiesUpdated`; throws `Error` if `applyEvent` returns `!result.ok`.

## Side Effects

- `[bench-incremental-projection.ts:main]` and `[bench-index-maintenance.ts:main]` Execute automatically on module load and print median/p95 timing tables and scaling ratios to stdout via `console.log`.

## Verification

- Run: `bun test`
