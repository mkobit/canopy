# @canopy/graph

Graph kernel: event log, projection, ops, validation, bootstrap, type-aware queries, history.

## Allowed dependencies

This package is a leaf — no `@canopy/*` imports.
External runtime deps: `remeda`, `temporal-polyfill`, `uuid`, `zod`.

## Forbidden

- No I/O, no transports, no React, no Yjs.
- `EventLogStore` is a port defined here; do not import storage adapters back into this package.
- Do not export `./constructors` from `src/index.ts` — its `createNodeId`/`createEdgeId`/etc.
  collide with `./factories` (different semantics: validated `Result` vs. raw UUIDv7).

## Public surface

`src/index.ts` is the package entry point.
Files like `create-graph.ts`, `resolve-namespace.ts`, `event-log.ts`, `history.ts` carry the kernel logic.
System constants and bootstrap data live in `src/system.ts` and `src/bootstrap.ts`.
