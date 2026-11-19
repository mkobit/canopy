# `@canopy/graph-access`

## Overview

The `@canopy/graph-access` package provides the single-source `canopy.v0` TypeSpec API specification, generated contract types and route descriptors, server route handlers, shared TypeScript client SDK, bounded query/traversal/mutation handlers, and live/replay event stream handlers over `@canopy/graph` and `@canopy/queries`.

## Subdirectories & Boundaries

- TypeSpec: [typespec](./typespec/README.md) — Single-source `Canopy.V0` TypeSpec specification (`main.tsp`) compiled into server/client contracts and unified WIT specs.
- Source: [src](./src/README.md) — Generated `canopy.v0` contracts, in-process server router/handlers, shared TypeScript client SDK, context/payload types, 7-category `Result` error mapping, query/mutation handlers, and event stream/replay handlers.
