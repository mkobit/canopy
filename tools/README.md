# Repository tooling

## Overview

This directory contains CLI release audits, CI and pre-commit quality gates, dependency graph checks, ESLint disable ratcheting, TypeSpec `canopy.v0` codegen, API baseline compatibility checks, and TypeScript refactoring scripts, rolling up `./hooks` and `./lib`.

## Interface

- `[audit-ai-tool-releases.ts:main]` Standalone CLI auditing `beads` versions against upstream releases.
- `[audit-beads-conventions.ts]` CLI (`--check-issue`, `--report`) auditing Beads lint, labels, orphan issues, and closed-issue commit reachability.
- `[check-api-compatibility.ts]` CLI (`--target`, `--update-baselines`, `--allow-breaking`, `--add-waiver`, `--protocol`, `--path`, `--reason`, `--ticket`, `--expires-at`, `--change-type`) checking `canopy.v0` TypeSpec and WASM WIT schema compatibility and codegen drift.
- `[check-built-package-exports.ts]` Standalone CLI verifying built `@canopy/graph-access` and `@canopy/plugin-host` exports.
- `[check-ci-tooling.ts:Violation, PinClassification, readMiseBunVersion, findSetupBunVersionPins, parseWorkflowEnvironment, resolvePinValue, classifyPin, checkWorkflowVersionConsistency, matchesGeneratedArtifact]` Workflow Bun pin and generated-artifact tracker.
- `[check-commands.ts]` Standalone CLI forbidding `npm`, `npx`, and `node` in `package.json` scripts (excluding `preinstall`) and `.husky/*`.
- `[check-dependency-graph.ts:readWorkspaces, deriveRuntimeEdges, deriveAllEdges, checkLeaf, checkCycle, extractMermaidBlock, parseMermaidGraph, resolveMermaidGraph, checkDocumentParity]` Workspace DAG, leaf-package, import-boundary, and `docs/architecture/bounded-contexts.md` parity checker.
- `[check-eslint-disable-ceiling.ts:isExcludedPath, countDirectives, countTrackedDirectives]` (`--update`) ESLint disable directive ratchet against `tools/eslint-disable-baseline.json`.
- `[check-plugin-artifacts.ts:PluginArtifactCheckResult, checkPluginArtifacts]` Verifies `apps/web/dist` main/worker module metadata isolation.
- `[lint-workspaces.ts]` Runs `eslint --cache` sequentially per workspace and for `tools/scripts/eslint.config.mjs`.
- `[refactor-ts.ts]` CLI (`--fix`, `--check`, `--dry-run`) running AST duplicate-type and unindexed-import analysis/rewriting.
- `[typespec-codegen.ts]` Deterministic TypeSpec `canopy.v0` compiler CLI (`--check`) generating `@canopy/graph-access` contracts and unified `@canopy/plugin-host` WIT/baseline artifacts.
- `[verify-versions.ts]` Verifies `engines.bun` vs `mise.toml` and dependency version uniformity across manifests.
- Subdirectories:
  - [hooks](./hooks/README.md) — `PostToolUse` Bun hook for formatting and linting.
  - [lib](./lib/README.md) — Reusable TypeScript utilities for TypeSpec codegen, API compatibility, Beads audits, import boundaries, and AST refactoring.

## Invariants

- `[typespec-codegen.ts]` Generated contract, WIT, and JSON baseline files must match deterministic compilation of `packages/graph-access/typespec/main.tsp` (`--check`).

- `[check-dependency-graph.ts:checkLeaf]` `@canopy/graph` must declare zero `@canopy/*` dependencies or devDependencies; the internal workspace graph must be acyclic; `packages/graph-access/src`, `packages/plugin-host/src`, and `apps/web/src` must not import `@canopy/api-adapter`.
- `[check-eslint-disable-ceiling.ts:main]` Tracked `.ts`/`.tsx`/`.mjs` directive count must remain `<=` the ceiling in `tools/eslint-disable-baseline.json`.
- `[check-ci-tooling.ts:GENERATED_ARTIFACT_PATTERNS]` No git-tracked file may match generated plugin-output patterns (`guest.js`, `plugin.wasm`, `/transpiled/`, `plugin-node.json`, `apps/web/src/plugin/types/`).
- `[check-commands.ts:checkCommandString]` No `package.json` script (except `preinstall`) or `.husky/*` line may invoke `npm`, `npx`, or `node`.
- `[check-plugin-artifacts.ts:checkPluginArtifacts]` Main and worker bundle metadata in `apps/web/dist` must exclude forbidden/unavailable-fixture modules.

## Side Effects

- `[audit-ai-tool-releases.ts]` Fetches latest release metadata from `registry.npmjs.org` and `api.github.com`.
- `[audit-beads-conventions.ts]` Spawns `git`, `bd`, and (with `--report`) `gh` subprocesses.
- `[check-api-compatibility.ts]` Writes `approved-breaking-changes.json` (`--add-waiver`) and baseline schema files (`--update-baselines`).
- `[typespec-codegen.ts]` Writes generated TypeSpec contract, WIT, and baseline files when invoked without `--check`.
- `[check-eslint-disable-ceiling.ts]`, `[refactor-ts.ts]` Mutate `tools/eslint-disable-baseline.json` (`--update`) or TypeScript source files (`--fix`).
- `[check-ci-tooling.ts]`, `[lint-workspaces.ts]` Spawn `git` and `eslint` subprocesses and exit `1` on violations.

## Verification

- Run: `bun test`
