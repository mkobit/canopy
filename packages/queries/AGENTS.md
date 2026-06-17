# @canopy/queries

Query DSL: pipeline model, executor, stored queries, view definitions, Cypher and legacy adapters.

## Allowed dependencies

`@canopy/graph` only.
External: `remeda`.

## Forbidden

- No I/O, no React, no Yjs.
- Cypher and legacy modules are stubs — do not extend them without revisiting the query interface design (see `docs/design/2026-02-08-query-engine.md`).
