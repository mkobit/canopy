# @canopy/core

This package implements the core graph engine, providing a functional, immutable API for graph operations.

## Code Navigation

Core graph logic is in `src/graph.ts`.
Query and traversal functions are in `src/query.ts`.
Main entry point is `src/index.ts`.

## Architectural Invariants

All functions are pure and stateless.
They take a `Graph` object and return a new `Graph` object (immutability).
No internal mutable state is maintained.
The `Graph` type from `@canopy/types` is the primary data structure.

## Dependencies

`@canopy/types` for domain types.
`@canopy/schema` for runtime validation (optional).

## Testing Approach

Unit tests verify that operations return new graph instances and do not mutate the original.
Tests run using `vitest` via `pnpm test`.
