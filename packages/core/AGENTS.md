# @canopy/core

This package implements the core graph engine, including node/edge management and CRDT integration.

## Code Navigation

Graph store logic is in `src/store/graph-store.ts`.
Main entry point is `src/index.ts`.

## Architectural Invariants

The `GraphStore` class is the sole owner of the graph state.
Mutations are performed via methods that return new immutable objects.
CRDT integration is handled internally via `@canopy/sync`.

## Dependencies

`@canopy/types` for domain types.
`@canopy/schema` for runtime validation.
`@canopy/sync` for CRDT capabilities.
`yjs` and `uuid` for implementation details.

## Testing Approach

Unit tests cover graph operations (add, update, delete) and validation logic.
Tests run using `vitest` via `pnpm test`.
