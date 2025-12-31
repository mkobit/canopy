# @canopy/storage

This package handles persistent storage of the graph data.

## Code Navigation

Storage adapters are located in `src/`.

## Architectural Invariants

Storage adapters must implement a common interface.
Storage operations should be asynchronous.

## Dependencies

`@canopy/types` for data structures.
`@canopy/sync` for document persistence.

## Testing Approach

Tests verify data persistence and retrieval using mock backends.
Run tests using `pnpm test`.
