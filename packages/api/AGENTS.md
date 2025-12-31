# @canopy/api

This package defines the public API and client SDK for Canopy.

## Code Navigation

API definitions are in `src/index.ts`.

## Architectural Invariants

The API layer abstracts internal implementation details.
Backward compatibility should be maintained where possible.

## Dependencies

`@canopy/types` for data transfer objects.

## Testing Approach

Tests verify API contract adherence.
Run tests using `pnpm test`.
