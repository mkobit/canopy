# Repository scripts

## Overview

This directory contains `check-sbx-env.ts`, a standalone Bun/TypeScript CLI script that verifies toolchain version parity for `bun` and `beads` across `mise.toml`, `package.json`, and `.sbx/kit/spec.yaml`.

## Interface

- None (standalone executable script with no exported symbols).

## Invariants

- `[check-sbx-env.ts:checkToolchainParity]` Requires `mise.toml`, `package.json`, and `.sbx/kit/spec.yaml` to exist in the working directory and `mise.toml` to define `tools.bun`.
- `[check-sbx-env.ts:checkToolchainParity]` Verifies that `packageManager` (minus `'bun@'`), `engines.bun`, and `.sbx/kit/spec.yaml` `bun@<semver>` match `mise.toml` `tools.bun`, and that `.sbx/kit/spec.yaml` matches `tools['github:gastownhall/beads']` when defined.

## Side Effects

- `[check-sbx-env.ts:checkToolchainParity]` Reads `mise.toml`, `package.json`, and `.sbx/kit/spec.yaml` via `existsSync` and `readFileSync`, writes diagnostics to `process.stderr` or summary to `process.stdout`, and calls `process.exit(1)` at module top level if `parityPassed` is `false`.

## Verification

- Run: `bun test`
