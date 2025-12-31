# @canopy/web

This is the main web application for Canopy.

## Code Navigation

Application source code is in `src/`.
Entry point is `src/main.tsx`.

## Architectural Invariants

The web app integrates all packages to provide the user experience.
It delegates logic to `@canopy/core`, `@canopy/query`, and `@canopy/storage`.

## Dependencies

`@canopy/core`, `@canopy/query`, `@canopy/storage`, `@canopy/ui`, `@canopy/types`.
`react`, `vite`.

## Testing Approach

Integration and end-to-end tests verify application functionality.
Run tests using `pnpm test`.
