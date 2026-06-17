# @canopy/sync

Yjs/CRDT integration: `SyncEngine`, `GraphStore` (Yjs ↔ Canopy converters), `SyncProvider` abstraction, awareness.

## Allowed dependencies

`@canopy/graph` only.
External: `yjs`, `y-protocols`.

## Forbidden

- Yjs imports live only in this package.
No other package may import `yjs` directly.
- No React, no DOM.
