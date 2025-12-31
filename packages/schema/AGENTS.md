# @canopy/schema

This package defines Zod schemas for runtime validation of Canopy types.

## Code Navigation

Schemas are defined in `src/index.ts` and correspond to types in `@canopy/types`.

## Architectural Invariants

Schemas must strictly match the types defined in `@canopy/types`.
Validation functions must be pure and stateless.

## Dependencies

`@canopy/types` for type definitions.
`zod` for schema definition and validation.

## Testing Approach

Tests verify that valid data passes validation and invalid data fails.
Run tests using `pnpm test`.
