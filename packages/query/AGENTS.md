# @canopy/query

This package provides query execution capabilities for the Canopy graph.

## Code Navigation

Query logic is in `src/index.ts`.

## Architectural Invariants

Query execution is read-only and does not modify the graph.
The implementation should be isolated to allow future replacement with ISO GQL.

## Dependencies

`@canopy/core` for graph access.
`@canopy/types` for result types.

## Testing Approach

Tests verify that queries return correct results against a known graph state.
Run tests using `pnpm test`.
