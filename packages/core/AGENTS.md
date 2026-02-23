# @canopy/core

## Architectural Invariants

All functions are pure and stateless.
They take a `Graph` object and return a new `Graph` object (immutability).
No internal mutable state is maintained.
The `Graph` type from `@canopy/types` is the primary data structure.
