# `canopy.v0` TypeSpec contract

## Overview

This directory holds the single-source TypeSpec specification (`main.tsp`) for the `Canopy.V0` API service (`Graphs`, `Transactions`, `Queries`, `Views`, `Bundles`, `Streams`) and the unified `canopy:graph` WebAssembly Interface Types (`Wit`) host/guest contracts.

## Interface

- `[main.tsp:Canopy.V0]` Defines domain scalars, enums, shared consistency/provenance models, six service route namespaces, and `@witPackage("canopy:graph")` interfaces (`graph-types`, `host-queries`, `host-mutations`, `host-events`, `host-filesystem`, `host-http`, `host-secrets`, `host-clock`, `draft-session`, `plugin-manifest`, `plugin-lifecycle`, `content-rendering`, `wizard-execution`) and worlds (`graph-plugin`, `server-extension-plugin`, `wizard-plugin`, `render-plugin`).

## Invariants

- `[main.tsp]` Serves as the single source compiled deterministically by `tools/typespec-codegen.ts` into `packages/graph-access/src/canopy-v0-contract.ts`, `packages/plugin-host/src/wasm/wit-spec.ts`, `packages/plugin-host/schema-baselines/plugin.wit`, and `packages/plugin-host/schema-baselines/canopy-v0-typespec.json`.

## Side Effects

- None (declarative specification file).

## Verification

- Run: `bun tools/typespec-codegen.ts --check`
- Run: `bun tools/check-api-compatibility.ts`
