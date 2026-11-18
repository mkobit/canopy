# Packages

## Overview

This directory groups the Canopy domain kernel, query engine, settings cascade, graph-access boundary, WASM plugin host, and `EventLogStore` storage adapters.

## Subdirectories & Boundaries

- Graph: [graph](./graph/README.md) — `@canopy/graph` leaf domain kernel (branded IDs, Zod schemas, bootstrap, projection, indexes, sessions, validation, ops).
- Graph Access: [graph-access](./graph-access/README.md) — `@canopy/graph-access` bounded query, traversal, mutation, and event-stream handlers.
- Plugin Host: [plugin-host](./plugin-host/README.md) — `@canopy/plugin-host` WIT specification, capability/tier validation, host bindings, and sandboxed/terminable WASM execution.
- Queries: [queries](./queries/README.md) — `@canopy/queries` functional query pipeline DSL, dual indexed/scan-only engines, Cypher adapter, and stored query/view execution.
- Settings: [settings](./settings/README.md) — `@canopy/settings` 5-level scoped settings cascade, `USER_SETTING` authoring, and 3-step `ViewDefinition` resolution.
- Storage: [storage](./storage/README.md) — `@canopy/storage` `EventLogStore` port re-exports and in-memory event store.
- Storage File: [storage-file](./storage-file/README.md) — `@canopy/storage-file` segmented JSONL file `EventLogStore` with atomic writes and reconciliation.
- Storage HTTP: [storage-http](./storage-http/README.md) — `@canopy/storage-http` HTTP `fetch` client `EventLogStore` adapter.
- Storage IndexedDB: [storage-indexeddb](./storage-indexeddb/README.md) — `@canopy/storage-indexeddb` browser IndexedDB `EventLogStore` and `GraphRegistry`.
- Storage SQLite: [storage-sqlite](./storage-sqlite/README.md) — `@canopy/storage-sqlite` `sql.js` SQLite `EventLogStore` with optional async binary persistence.
