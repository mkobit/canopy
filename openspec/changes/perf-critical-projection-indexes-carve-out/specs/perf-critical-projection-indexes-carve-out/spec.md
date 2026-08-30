## ADDED Requirements

### Requirement: Performance-critical modules carry dedicated benchmarks

Performance-critical modules in `@canopy/graph` (`packages/graph/src/indexes.ts` and `packages/graph/src/incremental-projection.ts`) SHALL maintain empirical performance benchmarks in `packages/graph/scripts/` tracked in `AGENTS.md` and runnable via `package.json` scripts (`bench:index-maintenance` and `bench:incremental-projection`).

#### Scenario: Running performance benchmarks

- **WHEN** a contributor or CI benchmark runner executes `bun run --cwd packages/graph bench:index-maintenance` or `bun run --cwd packages/graph bench:incremental-projection`
- **THEN** the benchmarks execute across scaling graph sizes ($n \in \{100, 1000, 10000, 50000\}$) and output wall-clock median and p95 timings without error.

### Requirement: Encapsulated mutation behind immutable boundaries

`packages/graph/src/indexes.ts` and `packages/graph/src/incremental-projection.ts` SHALL expose strictly immutable public types (`ReadonlyMap`, `ReadonlySet`, `readonly` properties) and pure functions returning newly constructed objects.
Internal state accumulation and builder operations MAY perform local mutative operations within function execution frames.

#### Scenario: Public API type safety

- **WHEN** external consumers import types and functions from `@canopy/graph`
- **THEN** all returned graph, index, and merge state types are immutable, and `functional/prefer-immutable-types` / `functional/type-declaration-immutability` enforce that no mutable signatures leak.

### Requirement: Scoped lint configuration for performance-critical modules

`eslint.config.mjs` SHALL define an explicit scoped override for `packages/graph/src/indexes.ts` and `packages/graph/src/incremental-projection.ts` disabling internal mutation rules (`functional/immutable-data`, `functional/no-loop-statements`, `functional/no-let`) while maintaining `functional/prefer-immutable-types` and `functional/type-declaration-immutability`.
All inline `eslint-disable` directives corresponding to these rules SHALL be eliminated, and the repository disable ceiling in `tools/eslint-disable-baseline.json` SHALL be ratcheted down accordingly.

#### Scenario: Linting performance-critical modules

- **WHEN** `bun run lint` is executed
- **THEN** zero unused `eslint-disable` warnings are emitted, the disable count does not exceed the ratcheted ceiling, and `bun tools/check-eslint-disable-ceiling.ts` succeeds.
