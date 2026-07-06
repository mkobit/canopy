# @canopy/storage-indexeddb

`EventLogStore` (defined in `@canopy/graph`) implemented over IndexedDB via `idb`, plus
`createGraphRegistry`, an independent IndexedDB store of `{id, name, createdAt, updatedAt}`
backing the web app's graph list/create/delete.

## Allowed dependencies

`@canopy/graph`.
External: `idb`.

## Forbidden

- No React, no UI concerns.
- Do not redefine `EventLogStore` or `EventLogQueryOptions` — import them from `@canopy/graph`.
