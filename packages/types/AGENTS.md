# @canopy/types

This package contains pure TypeScript type definitions for the Canopy system.

## Code Navigation

Foundational types are located in `src/index.ts`.
Types are organized in layers: primitives, domain values, properties, and node/edge structures.

## Architectural Invariants

This package must not have any runtime dependencies.
All types must be readonly.
No raw primitives should be used for identifiers; use branded types instead.

## Dependencies

No internal or external dependencies.

## Testing Approach

Types are tested via the TypeScript compiler (`pnpm typecheck`).
No runtime tests are needed as there is no runtime code.
