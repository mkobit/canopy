# `@canopy/extension`

## Overview

The `@canopy/extension` application implements the Manifest V3 browser extension for capturing active tab content and committing web clips to Canopy via `@canopy/clip-host`.

## Subdirectories & Boundaries

- Scripts: [scripts](./scripts/README.md) — Build script copying `manifest.json` and `popup.html` to `dist/`.
- Source: [src](./src/README.md) — Extension `background`, `content`, `popup`, and `shared` subsystems.
