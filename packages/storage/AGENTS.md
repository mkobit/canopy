# @canopy/storage

Persistence adapters: in-memory, SQLite, IndexedDB.
Implements the `EventLogStore` port defined in `@canopy/graph`.

## Allowed dependencies

`@canopy/graph`, `@canopy/sync`.
External: `idb`, `sql.js`.

## Forbidden

- No React, no UI concerns.
- Do not redefine `EventLogStore` or `EventLogQueryOptions` — re-export them from `@canopy/graph`.
- Storage adapters are async and return `Promise<Result<…, Error>>`; never throw.
