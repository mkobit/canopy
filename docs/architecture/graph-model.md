# Graph model

Product and architectural intent: [Core tenets](core-tenets.md).
Canonical reference: `docs/design/2026-02-06-core-data-model.md`.
Package layout: `docs/architecture/bounded-contexts.md`.

## Primitives

- `Node` — `{ id, shape?, properties, metadata }` (`shape` is `ShapeId | undefined`; `undefined` for open entities).
- `Edge` — `{ id, shape?, source, target, properties, metadata }` (`shape` is `ShapeId | undefined`; `undefined` for open entities).
- `Graph` — aggregate root holding `nodes` and `edges` maps.

All primitives live in `@canopy/graph` and are immutable.

## Meta-circular type system

Shape definitions are themselves nodes.
A `ShapeDefinition` node has `shape = SYSTEM_IDS.SHAPE` (`'node:type:shape'`) and its `properties` map describes `entityKind: 'node' | 'edge'`, `closed: boolean`, and property bindings (`inline` or `reference` to `SYSTEM_IDS.PROPERTY_TYPE` nodes).
This lets the schema evolve through the same event stream as data.

## Event sourcing

The graph is a projection over an append-only event log.
Events live in `@canopy/graph/events.ts` (`NodeCreated`, `NodePropertiesUpdated`, `NodeDeleted`, `EdgeCreated`, `EdgePropertiesUpdated`, `EdgeDeleted`, `WorkflowStarted`, `WorkflowCompleted`), with optional `shapeId?: ShapeId` on create events and optional `batchId?: BatchId` on all events.
Read-side upcasting in `@canopy/graph/event-upcast.ts` (`decodeStoredEvent`, `upcastStoredEvent`) normalizes legacy `nodeType`/`edgeType` fields and strips the `canopy:open` sentinel before Zod decoding.
The projection (`applyEvent`, `projectGraph`) is deterministic and pure.
LWW conflict resolution uses `(timestamp, deviceId)` ordering.

## Validation

Two layers, both in `@canopy/graph`:

1. Structural validity via Zod (`schemas.ts`).
2. Shape-aware validity against the `ShapeDefinition` and `PropertyType` nodes resolved from the graph (`validation.ts`), plus unified pre-commit batch validation (`batch-validation.ts`); open entities (`shape === undefined`) skip shape validation.

Ops accept an opt-in `validate` flag.
Callers may also run validation explicitly.

## Persistence

Persistence is out of scope for `@canopy/graph`.
The `EventLogStore` port (defined in `graph/event-log.ts`) is implemented by adapters in `@canopy/storage`, `@canopy/storage-indexeddb`, `@canopy/storage-sqlite`, `@canopy/storage-file`, and `@canopy/storage-http`.
`GraphSession` (`graph/graph-session.ts`) is the single write path: serialize `load`/`commit`, validate (`validateBatch`), append to the log, project incrementally, notify subscribers, and return `Result<CommitSuccess, CommitError>` (`batchId` and non-fatal `warnings`).
