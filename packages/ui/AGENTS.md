# @canopy/ui

## Architectural Invariants

Components must be stateless and receive data via props.
No data fetching or mutation should occur within components.
Components should be composable and focused on a single responsibility.
Styling should be customizable via `className` props.
