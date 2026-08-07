# Proposal: TypeScript refactoring automations for duplicate types and unindexed imports

## Summary

Creates AST refactoring automations in `tools/refactor-ts.ts` to detect duplicate type/interface declarations across bounded context packages and rewrite unindexed subpath imports to canonical package exports.

## Context

Canopy comprises six bounded context packages (`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage`, `@canopy/storage-indexeddb`, `@canopy/storage-sqlite`) plus application packages.
As code grows, duplicate type declarations and unindexed internal package imports (e.g. importing from `@canopy/graph/src/...` instead of `@canopy/graph`) degrade codebase maintainability and introduce type duplication risks.
Authoring dedicated AST refactoring tools using Bun and the TypeScript Compiler API automates code cleanup and prevents import drift.

## Proposed changes

1. Create `tools/refactor-ts.ts` AST refactoring tool using the TypeScript Compiler API.
2. Implement structural duplicate type detection across `@canopy/*` packages.
3. Implement unindexed subpath import detection and rewriting to canonical package exports.
4. Support `--dry-run` and `--fix` modes for developer workflow and CI checks.
5. Add package scripts `bun run refactor:check` and `bun run refactor:fix` in root `package.json`.

## Impact

- Eliminates duplicate type definitions and enforces clean index imports across bounded context packages.
- Runs natively under Bun without introducing external non-TypeScript dependencies.
