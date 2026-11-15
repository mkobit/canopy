# Guest plugin type declarations

## Overview

This directory defines ambient TypeScript module declarations for `canopy:graph/render-plugin` and `canopy:graph/plugin` by referencing and re-exporting namespaces from `./interfaces`.

## Interface

- `[render-plugin.d.ts:canopy:graph/render-plugin]` Ambient module declaration re-exporting `CanopyGraphPluginManifest` (from `canopy:graph/plugin-manifest`), `pluginLifecycle` (from `canopy:graph/plugin-lifecycle`), and `contentRendering` (from `canopy:graph/content-rendering`).
- `[wit.d.ts:canopy:graph/plugin]` Ambient module declaration re-exporting `CanopyGraphDraftSession` (from `canopy:graph/draft-session`), `CanopyGraphPluginManifest` (from `canopy:graph/plugin-manifest`), `pluginLifecycle` (from `canopy:graph/plugin-lifecycle`), and `wizardExecution` (from `canopy:graph/wizard-execution`).
- Subdirectory: [interfaces](./interfaces/README.md) — Ambient `.d.ts` definitions for the `canopy:graph/*` WIT component-model interfaces.

## Invariants

- None.

## Side Effects

- None.

## Verification

- Run: `bun test`
