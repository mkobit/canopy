# @canopy/storage-indexeddb

`EventLogStore` (defined in `@canopy/graph`) implemented over IndexedDB via `idb`, plus the
deprecated legacy Yjs-snapshot `StorageAdapter` (kept only as the one-time vault import's read
path; see `docs/design/2026-07-03-event-log-storage-and-sync.md`).

## Allowed dependencies

`@canopy/graph`, `@canopy/storage` (for the shared `StorageAdapter`/`GraphStorageMetadata`
contract types).
External: `idb`.

## Forbidden

- No React, no UI concerns.
- Do not redefine `EventLogStore` or `EventLogQueryOptions` — import them from `@canopy/graph`.
- Do not extend or reuse `indexeddb-adapter.ts` (deprecated) for new functionality — it is deleted
  once the legacy vault import ships.
