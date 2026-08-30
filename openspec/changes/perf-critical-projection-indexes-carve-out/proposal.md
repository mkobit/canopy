## Why

`packages/graph/src/incremental-projection.ts` (78 directives) and `packages/graph/src/indexes.ts` (77 directives) account for 155 of the 435 remaining `eslint-disable` directives in the repository.
These directives are almost entirely `functional/immutable-data` and `functional/no-loop-statements`.
Unlike ordinary application code, internal mutation in these two modules was a deliberate $O(\delta)$ performance architecture choice accepted during read-model design (see `canopy-c54`).
Naive plain-functional rewrites (e.g. allocating and copying multi-thousand element index buckets or graphs on every single event) regress wall-clock merge throughput by orders of magnitude.
We must establish an evidence-backed design decision for these performance-critical hot modules, backed by load benchmarks, before executing any rewrite or lint configuration update.

## What Changes

- Standardize the architectural approach: **Sanctioned mutable-behind-a-pure-boundary pattern (encapsulated builder with strictly immutable public signatures)**.
- Confirm baseline benchmarks for both modules: `packages/graph/scripts/bench-index-maintenance.ts` (indexes) and `packages/graph/scripts/bench-incremental-projection.ts` (incremental projection) provide non-gating empirical performance baselines.
- Update `AGENTS.md` and `docs/architecture/decisions.md` to document the perf-critical carve-out pattern: internal localized mutations within pure functions or internal builder frames are permitted for designated performance-critical modules (`incremental-projection.ts` and `indexes.ts`), while public API contracts remain strictly immutable (`ReadonlyMap`, `ReadonlySet`, `readonly` properties, pure functions returning new objects).
- Formulate the lint strategy for the carve-out: define explicit scoped overrides in `eslint.config.mjs` for internal mutation rules (`functional/immutable-data`, `functional/no-loop-statements`, `functional/no-let`) limited specifically to these two designated files, while keeping `functional/prefer-immutable-types` and `type-declaration-immutability` active so their exported signatures stay 100% immutable.
- Update the ratchet baseline ceiling (`tools/eslint-disable-baseline.json`) once the 155 inline directives are eliminated via the scoped configuration.

## Capabilities

### New Capabilities

- `perf-critical-functional-carve-out`: Formalized architectural policy and lint configuration standardizing encapsulated local mutation behind pure, immutable boundaries for designated performance-critical modules in `@canopy/graph`.

### Modified Capabilities

- None.

## Impact

- **Codebase:** Eliminates 155 inline `eslint-disable` directives across `incremental-projection.ts` and `indexes.ts`, significantly lowering the repository disable ceiling.
- **Performance:** Preserves $O(\delta)$ incremental index maintenance and graph projection merge performance without regressing wall-clock timings or introducing external collection libraries.
- **Architecture:** Reinforces AGENTS.md Invariant #1 (leaf `@canopy/graph` remains dependency-light) and Invariant #6 (all domain type properties and public signatures remain `readonly` and immutable).
