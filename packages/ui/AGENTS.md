# @canopy/ui

This package provides React components for the Canopy user interface.

## Code Navigation

Components are located in `src/`.

## Architectural Invariants

Components must be stateless and receive data via props.
No data fetching or mutation should occur within components.

## Dependencies

`@canopy/types` for prop types.
`react` and `react-dom` for rendering.

## Testing Approach

Components are tested for rendering correctness.
Run tests using `pnpm test`.
