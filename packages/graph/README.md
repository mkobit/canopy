# `@canopy/graph`

## Overview

The `@canopy/graph` package is the leaf domain kernel for Canopy, defining immutable graph structures, branded IDs, Zod schemas, `EventLogStore` ports, event-sourced projection, read-model indexes, sessions, validation, and benchmarks.

## Subdirectories & Boundaries

- Scripts: [scripts](./scripts/README.md) — Standalone CLI benchmarks for incremental projection and read-model index maintenance.
- Source: [src](./src/README.md) — Core graph kernel, `ops`, bootstrap, projection, indexes, time travel, sessions, validation, and workflows.
