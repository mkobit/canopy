# @canopy/storage

Storage contract re-exports (`EventLogStore`, `StorageAdapter`, `GraphStore`) plus the
dependency-free in-memory `EventLogStore`.
Per-backend implementations (SQLite, IndexedDB) live in `@canopy/storage-sqlite` and
`@canopy/storage-indexeddb`, so this package pulls in no third-party runtime dependencies.

## Allowed dependencies

`@canopy/graph` only.
No third-party runtime dependencies — keep it that way.

## Forbidden

- No React, no UI concerns.
- Do not redefine `EventLogStore` or `EventLogQueryOptions` — re-export them from `@canopy/graph`.
- No backend implementations here (no `idb`, `sql.js`, or similar) — those belong in a
  per-backend package named for the backend it owns.
- Storage adapters are async and return `Promise<Result<…, Error>>`; never throw.
