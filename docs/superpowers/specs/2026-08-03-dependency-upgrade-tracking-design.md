# Design Document: Dependency Upgrade Tracking & Handling (`canopy-sfv`)

**Date**: 2026-08-03  
**Status**: Approved  
**Bead**: `canopy-sfv`

## Context & Objectives

Canopy relies on automated grouped dependency management via Dependabot (`.github/dependabot.yml`). Major version bumps for key tools and core libraries (e.g. ESLint plugins, fast-check, GraphQL, temporal-polyfill, and TypeScript) require manual triage, verification, and workspace-wide alignment to prevent lint failures, type errors, or package version drift.

This spec outlines the process and execution plan for tracking, verifying, and integrating pending major/minor dependency upgrades (PR #406 and PR #407) while maintaining workspace-wide version consistency and strict compiler/linter compatibility.

## System Design & Scope

### 1. Grouped Dependency Upgrades to Process

- **`lint-and-format` Group (PR #406)**:
  - `eslint-plugin-unicorn`: Bump from `71.1.0` to `72.0.0` (semver-major).
- **`other` Group (PR #407)**:
  - `fast-check`: Bump from `3.23.2` to `4.9.0` (semver-major) in `@canopy/graph`.
  - `graphql`: Bump from `16.10.0` to `17.0.2` (semver-major) in `@canopy/api-adapter`.
  - `temporal-polyfill`: Bump from `0.3.2` to `1.0.1` (semver-major) across `@canopy/api-adapter`, `@canopy/graph`, `@canopy/queries`, `@canopy/storage-file`, `@canopy/storage-http`, `@canopy/storage-indexeddb`, `@canopy/storage-sqlite`, `@canopy/storage`.

### 2. Workspace Version Alignment Policy

All dependencies shared across packages in the monorepo must maintain uniform versions.
- `tools/verify-versions.ts` (invoked via `bun run check:versions` during `bun run lint`) will enforce zero version drift.
- Any update to a dependency in root `package.json` or a child package `package.json` must be reflected across all declaring child packages.

### 3. TypeScript 7 Strategy Alignment

- Plain `typescript` devDependency remains pinned to `6.0.3` for `typescript-eslint` compatibility (`<6.1.0`).
- Native fast build remains on `typescript-native` (`npm:typescript@7.0.2`).
- `.github/dependabot.yml` ignores `semver-major` for `typescript` until TS 7.1 + `typescript-eslint` support is available (tracked under bead `canopy-x1j`).

---

## Adversarial Review and Mitigations

### Resource and Performance Overhead
- **Risk**: `eslint-plugin-unicorn` v72 or `graphql` v17 might introduce performance regressions in linting or execution.
- **Mitigation**: Run `bun run lint` and `bun test` to verify execution times and ensure zero lint or memory regressions.

### Failure Modes and Edge Cases
- **Risk**: `temporal-polyfill` 1.0.1 or `fast-check` 4.9.0 breaking changes in property tests or date/time formatting.
- **Mitigation**: Execute complete workspace test suite (`bun test`). Update any changed API calls or type signatures in test generators.

### Migration and Compatibility Risks
- **Risk**: Version drift between child packages causing runtime dependency resolution mismatches.
- **Mitigation**: Run `bun run check:versions` as part of `bun run lint` quality gate.

---

## Verification Plan

1. `bun run build`: Clean TypeScript compile across all packages using native TS 7 compiler.
2. `bun run lint`: ESLint check with `eslint-plugin-unicorn` v72 + `verify-versions` + `check-api-compatibility`.
3. `bun run typecheck`: Typecheck across all workspace packages.
4. `bun test`: All unit, property-based, and integration tests passing.
5. `bd`: Close `canopy-sfv` and sync beads state.
