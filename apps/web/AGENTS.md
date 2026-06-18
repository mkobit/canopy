# apps/web

Vite + React + xyflow frontend for Canopy.

## Allowed dependencies

`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage`, `@canopy/sync`.

## Architectural invariants

- `StorageContext` initializes the `StorageAdapter` (SQLite/IDB).
- `GraphContext` owns the active `SyncEngine` and projected `Graph`.
- UI components are stateless and props-driven.
React local state is allowed for transients; global state lives in context.

## Verification

`bun run dev` starts the app.
`bun test` runs the suite.
