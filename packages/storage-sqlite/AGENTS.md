# @canopy/storage-sqlite

`EventLogStore` (defined in `@canopy/graph`) implemented over SQLite via `sql.js`.

## Allowed dependencies

`@canopy/graph` only.
External: `sql.js`.

## Forbidden

- No React, no UI concerns.
- Do not redefine `EventLogStore` or `EventLogQueryOptions` — import them from `@canopy/graph`.
- No Yjs-snapshot surface (`StorageAdapter`) — that legacy path lives only in `@canopy/storage-indexeddb`, deprecated.
