# desktop-app

This is the desktop wrapper for Canopy, using Electron.

## Code Navigation

Main process code is in `src/`.

## Architectural Invariants

The desktop app wraps the web application and adds native capabilities.
It shares the same codebase as the web app where possible.

## Dependencies

`@canopy/web` (conceptually), `electron`.

## Testing Approach

Tests verify desktop-specific features and startup.
Run tests using `pnpm test`.
