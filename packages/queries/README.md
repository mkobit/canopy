# `@canopy/queries`

## Overview

The `@canopy/queries` package provides the functional query pipeline DSL, dual indexed and scan-only query execution engines, stubbed Cypher adapter, and stored query/view persistence and execution over `@canopy/graph`.

## Subdirectories & Boundaries

- Scripts: [scripts](./scripts/README.md) — Standalone CLI benchmark for `GraphSession` projection and `executeQuery` on a 10,000-node fixture.
- Source: [src](./src/README.md) — Query AST/pipeline DSL, indexed/scan-only engines, Cypher adapter, and stored query/view definitions.
