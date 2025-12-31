# @canopy/sync

This package manages Yjs document synchronization and awareness.

## Code Navigation

Sync engine logic is in `src/index.ts`.

## Architectural Invariants

Yjs document management is centralized here.
This package provides the underlying CRDT structures used by `@canopy/core`.

## Dependencies

`@canopy/types` for type definitions.
`yjs` for CRDT implementation.

## Testing Approach

Tests verify document synchronization and state consistency.
Run tests using `pnpm test`.
