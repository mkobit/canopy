# Bounded contexts

Canopy is split into nine packages.
Each owns a single bounded concept.
Generic catch-all packages (`types`, `schema`, `api`) are not used.

## Dependency graph

```mermaid
graph TD
  graph[@canopy/graph]
  queries[@canopy/queries]
  settings[@canopy/settings]
  storage[@canopy/storage]
  storageIndexeddb[@canopy/storage-indexeddb]
  storageSqlite[@canopy/storage-sqlite]
  storageFile[@canopy/storage-file]
  storageHttp[@canopy/storage-http]
  apiAdapter[@canopy/api-adapter]
  web[apps/web]
  cli[apps/cli]
  daemon[apps/daemon]
  clipHost[apps/clip-host]
  extension[apps/extension]

  queries --> graph
  settings --> graph
  storage --> graph
  storageIndexeddb --> graph
  storageSqlite --> graph
  storageFile --> graph
  storageHttp --> graph
  apiAdapter --> graph
  apiAdapter --> queries

  web --> graph
  web --> queries
  web --> settings
  web --> storage
  web --> storageIndexeddb
  web --> apiAdapter
  cli --> graph
  cli --> storage
  cli --> apiAdapter
  daemon --> graph
  daemon --> storage
  daemon --> storageSqlite
  daemon --> apiAdapter
  clipHost --> graph
  clipHost --> apiAdapter
```

`apps/extension` has no `@canopy/*` dependencies (zero-dependency browser code, no bundler -- see `apps/extension/AGENTS.md`) and so has no outgoing edges above; it talks to `apps/clip-host` over native-messaging stdio, not an import.

`@canopy/graph` is the leaf and has no internal dependencies.
All other packages depend on it.

## Scope per package

### @canopy/graph

The kernel.
Owns identifiers, primitives, Zod schemas, `Node`, `Edge`, `Graph`, events, projection, ops, type-aware validation, bootstrap, namespace resolution, the event bus, the workflow engine, and history (point-in-time reconstruction).
Also owns `GraphSession` (`createGraphSession`) — the single write path shared by every consumer: `load` (read the event log, project), `commit` (validate → append → merge → notify), `graph()`, `subscribe`.
Defines the `EventLogStore` port that storage adapters implement.
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

Storage contract re-exports (`EventLogStore`, `EventLogQueryOptions`) plus the dependency-free in-memory `EventLogStore` implementation.
Pulls in no third-party runtime dependencies, so consumers that only need the port stay dependency-free.
Returns `Promise<Result<…, Error>>`; never throws.

### @canopy/storage-indexeddb

Implements `EventLogStore` over IndexedDB via `idb`.
Also owns `createGraphRegistry`, a small independent IndexedDB store of `{id, name, createdAt, updatedAt}` that lists known graphs — `EventLogStore` is scoped to a single known `graphId` and has no enumerate-all operation, so the registry fills that gap for the web app's graph list/create/delete.

### @canopy/storage-sqlite

Implements `EventLogStore` over SQLite via `sql.js`.

### @canopy/storage-file

Implements `EventLogStore` over the local filesystem as per-device JSONL segment files plus a manifest; the on-disk format doubles as the eventual-sync artifact.
Adds a `reconcile` operation that ingests other devices' segment folders via per-device watermarks — single writer per device folder, so file conflicts are structurally impossible.

### @canopy/storage-http

Implements `EventLogStore` over a REST API (`POST`/`GET /graphs/:id/events`) — a stateless request/response event carrier with no background sync loop.

### @canopy/api-adapter

The transport and protocol adapter layer over `@canopy/graph` and `@canopy/queries`.
Hosts the Unix-socket JSON-RPC IPC server (`createIpcServer`) and the `canopy.v1.draft.*` family that wraps `DraftSession`, plus the WASM plugin host bindings.
Consumed by `apps/cli`, `apps/daemon`, `apps/clip-host`, and `apps/web` (the WASM plugin host bindings for content rendering).

## Cross-context ports

- `EventLogStore` is defined in `@canopy/graph/event-log.ts` and implemented by `@canopy/storage`, `@canopy/storage-indexeddb`, `@canopy/storage-sqlite`, `@canopy/storage-file`, and `@canopy/storage-http`.
  This breaks what would otherwise be a cycle between `graph/history.ts` and the storage packages.
- `GraphSession` (`@canopy/graph/graph-session.ts`) is the single write path for every consumer of an `EventLogStore`: it owns validation, append, incremental convergent projection, and subscriber notification so the app never mutates a graph directly.

## Allowed import rules

### Production source (`src/`)

- A package's production code may only import from packages listed in its `package.json` `dependencies`.
- Production code must never import from `devDependencies`.
- Cross-package shortcuts (deep imports into another package's `src/` or unexported internals) are forbidden.
- Within production code, use relative imports between sibling files; do not import the package's own public barrel or package name.

### Test and benchmark files (`test/`, `scripts/`, `*.test.ts`)

- Test and benchmark files may import from packages listed in either `dependencies` or `devDependencies`.
- Test files may import the package's own public barrel (e.g. `import { ... } from '@canopy/graph'`) to test through its public API surface.
- Test files must not deep-import unexported internals across package boundaries.

## Where to look next

- Per-package conventions: each package's `AGENTS.md`.
- Data model: `docs/design/2026-02-06-core-data-model.md`.
- Event model: `docs/design/2026-02-08-event-system.md`.
- Event log migration design: `docs/design/2026-07-03-event-log-storage-and-sync.md`.
- Query interfaces: `docs/design/2026-02-08-query-engine.md`.
- Extensions and plugin host (deferred design): `docs/design/2026-02-08-extension-and-execution-model.md`.
- Browser extension web clipper (`apps/extension` + `apps/clip-host`): `openspec/changes/browser-extension-web-clipper/design.md`.
