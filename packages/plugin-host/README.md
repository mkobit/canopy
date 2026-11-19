# `@canopy/plugin-host`

## Overview

The `@canopy/plugin-host` package provides the unified WebAssembly Interface Types (WIT) contract baseline generated from TypeSpec `canopy.v0`, capability validation, fuel/memory/reentrancy/timeout-guarded guest execution, and WIT error mapping over `@canopy/graph-access`.

## Subdirectories & Boundaries

- Schema Baselines: `./schema-baselines` — Unified `plugin.wit` (`package canopy:graph;`), `canopy-v0-typespec.json` IR snapshot, and `approved-breaking-changes.json` waiver manifest.
- Source: [src](./src/README.md) — `toWitError` mapper and `./wasm/README.md` (generated WIT spec, capability/tier resolution, host bindings, and sandboxed/terminable executors).
