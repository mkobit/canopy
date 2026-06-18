# apps/cli

Effect-based command-line entry point.
Currently a scaffold; commands TBD.

## Allowed dependencies

`@canopy/graph`, `@canopy/storage`.
External: `effect`, `@effect/cli`, `@effect/platform-node`.

## Forbidden

- No React, no browser globals.
- Use Effect for I/O and error handling, not throw/try-catch.
