# Canopy Blueprint

## System Overview

Canopy is a graph-based personal knowledge management system built around an immutable, event-sourced domain kernel (`@canopy/graph`), a functional query and view engine (`@canopy/queries`), a scoped settings cascade (`@canopy/settings`), a bounded graph-access layer (`@canopy/graph-access`), a sandboxed WASM plugin host (`@canopy/plugin-host`), and pluggable `EventLogStore` backends (`storage`, `storage-file`, `storage-http`, `storage-indexeddb`, `storage-sqlite`). User-facing surfaces include the React web SPA (`@canopy/web`) and Effect CLI entrypoint (`@canopy/cli`).

## Subdirectories & System Boundaries

- Applications: [apps](./apps/README.md) — Runnable `@canopy/cli` and `@canopy/web` workspaces.
- Packages: [packages](./packages/README.md) — Core `@canopy/*` libraries (`graph`, `queries`, `settings`, `graph-access`, `plugin-host`, and `storage*` adapters).
- Scripts: [scripts](./scripts/README.md) — Toolchain parity check (`check-sbx-env.ts`) verifying `bun` and `beads` versions across `mise.toml`, `package.json`, and `.sbx/kit/spec.yaml`.
- Tools: [tools](./tools/README.md) — CI/pre-commit quality gates, dependency graph checks, ESLint disable ceiling ratchets, API baseline checks, hooks, and refactoring utilities.

## Global Invariants

- `@canopy/graph` is the leaf package with zero `@canopy/*` dependencies, and the internal workspace dependency graph is acyclic.
- All domain types use branded IDs, `readonly` properties, `Result<T, E>` error returns, and Zod runtime validation rather than raw primitives or thrown domain errors.
- `@canopy/graph-access` enforces query depth/cost/stream limits across callers and `@canopy/plugin-host` WASM bindings.
- Untrusted WASM plugins run under explicit capability validation, fuel/memory/reentrancy/timeout guards, and Tier-1 sanitized closed Shadow DOM or Tier-2 opaque-origin sandboxed iframes.
- No `package.json` script (except `preinstall`) or `.husky/*` hook may invoke `npm`, `npx`, or `node`; ESLint disable directives cannot exceed `tools/eslint-disable-baseline.json`.

## Global Side Effects

- Persistence adapters read and write in-memory maps, segmented JSONL files, HTTP `/graphs/:id/events` endpoints, browser IndexedDB (`canopy-registry`, `canopy-events`), and `sql.js` SQLite databases.
- `@canopy/web` spawns Web Workers, mounts React and closed Shadow DOM / sandboxed iframes, and persists device IDs in `localStorage`.
- `tools/` scripts spawn `git`, `bd`, `gh`, `eslint`, and `bunx jco` subprocesses and fetch release metadata over HTTPS.

## System Verification

- Run: `bun test`
