# apps/web

Vite + React + xyflow frontend for Canopy.

## Allowed dependencies

`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage`, `@canopy/storage-indexeddb`.

## Architectural invariants

- `StorageContext` initializes the IndexedDB event log and graph registry (`@canopy/storage-indexeddb`).
- `GraphContext` owns the active `GraphSession` and projected `Graph`.
- UI components are stateless and props-driven.
  React local state is allowed for transients; global state lives in context.

## Frontend guidance skill

Invoke the `modern-web-guidance` skill before HTML/CSS or clientside JS work here (layout, dialogs, forms, animation, performance).
It searches current web-platform best practices (CWV/LCP/INP, view transitions, container queries, `:has()`, anchor positioning, forms/autofill) instead of relying on stale training data.

## Verification

`bun run dev` starts the app.
`bun test` runs the suite.
