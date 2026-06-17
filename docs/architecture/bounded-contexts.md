# Bounded contexts

Canopy is split into five packages.
Each owns a single bounded concept.
Generic catch-all packages (`types`, `schema`, `api`) are not used.

## Dependency graph

```mermaid
graph TD
  graph[@canopy/graph]
  queries[@canopy/queries]
  settings[@canopy/settings]
  storage[@canopy/storage]
  sync[@canopy/sync]
  web[apps/web]
  cli[apps/cli]

  queries --> graph
  settings --> graph
  storage --> graph
  storage --> sync
  sync --> graph

  web --> graph
  web --> queries
  web --> settings
  web --> storage
  web --> sync
  cli --> graph
  cli --> storage
```

`@canopy/graph` is the leaf and has no internal dependencies.
All other packages depend on it.

## Scope per package

### @canopy/graph

The kernel.
Owns identifiers, primitives, Zod schemas, `Node`, `Edge`, `Graph`, events, projection, ops, type-aware validation, bootstrap, namespace resolution, the event bus, the workflow engine, and history (point-in-time reconstruction).
Also defines the `EventLogStore` port that storage adapters implement.
No I/O, no Yjs, no React.

### @canopy/queries

The query DSL.
Owns the pipeline model, executor, stored-query helpers, view definitions, and stub Cypher and legacy adapters.
Depends on `@canopy/graph` for data and ops.

### @canopy/settings

The settings cascade.
Resolves a setting through the node → type → namespace → global → schema-default chain.
Owns the `UserSetting` creation op.
Depends on `@canopy/graph`.

### @canopy/storage

Persistence adapters.
Implements `EventLogStore` for in-memory, SQLite (`sql.js`), and IndexedDB backends.
Returns `Promise<Result<…, Error>>`; never throws.

### @canopy/sync

Yjs/CRDT integration.
Owns `SyncEngine`, the `Y.Doc` ↔ Canopy `GraphStore` converters, and the `SyncProvider` abstraction.
Yjs imports live only here.

## Cross-context ports

- `EventLogStore` is defined in `@canopy/graph/event-log.ts` and implemented by `@canopy/storage`.
  This breaks what would otherwise be a cycle between `graph/history.ts` and `storage`.
- `SyncProvider` is defined in `@canopy/sync` and implemented by transport-specific adapters (WebSocket, WebRTC, in-memory).

## Allowed import rules

A package may only import from the packages listed in its `package.json` `dependencies`.
Cross-package shortcuts (deep imports into another package's `src/`) are forbidden.
Within a package, prefer relative imports between sibling files; do not import the package's own public name.

## Where to look next

- Per-package conventions: each package's `AGENTS.md`.
- Data model: `docs/design/2026-02-06-core-data-model.md`.
- Event model: `docs/design/2026-02-08-event-system.md`.
- Query interfaces: `docs/design/2026-02-08-query-engine.md`.
- Extensions and plugin host (deferred design): `docs/design/2026-02-08-extension-and-execution-model.md`.
