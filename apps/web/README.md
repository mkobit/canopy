# `@canopy/web`

## Overview

The `@canopy/web` application is the browser-based React SPA for Canopy, providing graph exploration, block editing, schema authoring, stored views, IndexedDB persistence, and Tier-1/Tier-2 WASM plugin rendering.

## Subdirectories & Boundaries

- Scripts: [scripts](./scripts/README.md) — WIT codegen, plugin packaging CLI scripts, and manual WASM/worker render benchmarks.
- Source: [src](./src/README.md) — Application bootstrap, UI `components`, React `context` providers, `pages`, `plugin` runtime/guests, and `utils`.
