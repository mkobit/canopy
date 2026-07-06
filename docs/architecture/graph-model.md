# Graph model

Canonical reference: `docs/design/2026-02-06-core-data-model.md`.
Package layout: `docs/architecture/bounded-contexts.md`.

## Primitives

- `Node` — `{ id, type, properties, metadata }`.
- `Edge` — `{ id, type, source, target, properties, metadata }`.
- `Graph` — aggregate root holding `nodes` and `edges` maps.

All primitives live in `@canopy/graph` and are immutable.

## Meta-circular type system

Type definitions are themselves nodes.
A `NodeTypeDefinition` node has `type = SYSTEM_IDS.NODE_TYPE` and its `properties` map describes the schema for nodes of that type.
The same pattern applies to `EdgeTypeDefinition`.
This lets the schema evolve through the same event stream as data.

## Event sourcing

The graph is a projection over an append-only event log.
Events live in `@canopy/graph/events.ts` (`NodeCreated`, `NodePropertiesUpdated`, `NodeDeleted`, `EdgeCreated`, `EdgePropertiesUpdated`, `EdgeDeleted`, `WorkflowStarted`, `WorkflowCompleted`).
The projection (`applyEvent`, `projectGraph`) is deterministic and pure.
LWW conflict resolution uses `(timestamp, deviceId)` ordering.

## Validation

Two layers, both in `@canopy/graph`:

1. Structural validity via Zod (`schemas.ts`).
2. Type-aware validity against the `NodeTypeDefinition` / `EdgeTypeDefinition` resolved from the graph (`validation.ts`).

Ops accept an opt-in `validate` flag.
Callers may also run validation explicitly.

## Persistence

Persistence is out of scope for `@canopy/graph`.
The `EventLogStore` port (defined in `graph/event-log.ts`) is implemented by adapters in `@canopy/storage`, `@canopy/storage-indexeddb`, and `@canopy/storage-sqlite`.
`GraphSession` (`graph/graph-session.ts`) is the single write path: validate, append to the log, project incrementally, notify subscribers.
