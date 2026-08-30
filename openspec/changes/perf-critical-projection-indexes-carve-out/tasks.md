## 1. Benchmarks & Inventory

- [x] 1.1 Create `packages/graph/scripts/bench-incremental-projection.ts` measuring single-event merges, out-of-order dependency resolution, and batch merges across $n \in \{100, 1000, 10000, 50000\}$.
- [x] 1.2 Add `"bench:incremental-projection"` to `packages/graph/package.json`.
- [x] 1.3 Update `AGENTS.md` Performance-based modules inventory table marking `incremental-projection.ts` as Covered.
- [x] 1.4 Execute both `bench:index-maintenance` and `bench:incremental-projection` to capture baseline metrics.

## 2. Architecture Decision & Documentation

- [x] 2.1 Add dated ADR entry to `docs/architecture/decisions.md` documenting the sanctioned mutable-behind-a-pure-boundary pattern for performance-critical modules in `@canopy/graph`.
- [x] 2.2 Update `docs/research/2026-08-15-eliminating-eslint-disables-playbook.md` noting the formal carve-out resolution for `indexes.ts` and `incremental-projection.ts`.

## 3. Lint Configuration & Directive Elimination

- [x] 3.1 Configure scoped override in `eslint.config.mjs` for `packages/graph/src/indexes.ts` and `packages/graph/src/incremental-projection.ts` disabling internal mutation rules (`functional/immutable-data`, `functional/no-loop-statements`, `functional/no-let`) while retaining `functional/prefer-immutable-types` and `functional/type-declaration-immutability`.
- [x] 3.2 Remove the 155 inline `eslint-disable` directives from `packages/graph/src/indexes.ts` and `packages/graph/src/incremental-projection.ts`.
- [x] 3.3 Ratchet down the directive count ceiling in `tools/eslint-disable-baseline.json` using `bun tools/check-eslint-disable-ceiling.ts --update`.

## 4. Verification

- [x] 4.1 Run `mise run check` to verify build, lint, typecheck, tests, and strict OpenSpec validation.
- [x] 4.2 Re-run benchmarks to verify zero regression against baseline.
