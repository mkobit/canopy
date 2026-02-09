# Event system

> Status: **draft**
> Scope: event model, event lifecycle, migration events, batch semantics, validation, ordering, conflict resolution
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md)

---

## 1. Principles

Events are the write API of the system.
Every mutation to the graph produces one or more events.
Nothing changes without an event.

The event log is append-only and immutable.
Once written, events are never modified or deleted.
Deleting a node produces a `NodeDeleted` event; it does not remove the original `NodeCreated` event.

This gives the system full history, audit trails, time-travel, and replayability.
The event log is the portable, canonical artifact that can reconstruct any graph state.

---

## 2. Event identity and ordering

### Event identity

Each event has an **EventId** (UUIDv7).

EventId serves two purposes:

- **Deduplication**: the same event arriving from multiple sync sources is recognized as one event.
- **Ordering**: the timestamp encoded in the UUIDv7 provides a total order over events.

### Device/client ID

The random bits of the UUIDv7 are seeded with a **device or client ID**.
This makes event ordering fully deterministic: two events with the same millisecond timestamp from different devices always sort the same way.

Benefits:

- Projection is deterministic across replays, regardless of which device replays the events.
- Events are traceable to the device that produced them, which is useful for debugging sync issues.
- No ambiguity in ordering when events arrive out of order during sync.

> **Open question**: exact mechanism for encoding device/client ID into UUIDv7 random bits is TBD.
> The requirement is: given the same set of events, any device must produce the same projection.

### Ordering guarantees

Events are ordered by their UUIDv7 timestamp (primary) and device-seeded random bits (tiebreaker).
This produces a strict total order over all events in the system.

Causal ordering (event B happened because of event A) is not explicitly tracked.
The total order is sufficient for projection because projection is a sequential fold over events.

> **Open question**: whether causal ordering metadata (e.g., a `causedBy` reference to a prior EventId) adds value for debugging, undo, or workflow tracking.

---

## 3. Event types

### Core graph events

| Event                   | Payload                                                          | Description                                    |
| ----------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| `NodeCreated`           | NodeId, TypeId, initial properties                               | A new node was added to the graph              |
| `NodePropertiesUpdated` | NodeId, property changes (set, removed)                          | One or more properties on a node changed       |
| `NodeDeleted`           | NodeId                                                           | A node was tombstoned (not physically removed) |
| `EdgeCreated`           | EdgeId, TypeId, source NodeId, target NodeId, initial properties | A new edge was added between two nodes         |
| `EdgePropertiesUpdated` | EdgeId, property changes (set, removed)                          | One or more properties on an edge changed      |
| `EdgeDeleted`           | EdgeId                                                           | An edge was removed                            |

### Common event metadata

Every event carries:

- **EventId**: UUIDv7 with device-seeded random bits.
- **Timestamp**: Instant (milliseconds since epoch, redundant with UUIDv7 but explicit).
- **DeviceId/ClientId**: identifier of the originating device.
- **BatchId**: optional, shared across events that are logically atomic (see section 5).
- **MigrationId**: optional, present when the event was produced by a schema migration (see section 4).

---

## 4. Migration events

### Principle

Schema changes are events, not side effects.
When the application upgrades and needs to modify the graph schema (add system types, update type definitions, migrate existing nodes), it emits events into the log.

This means:

- Migrations are replayable.
- The event log is a complete history including schema evolution.
- No out-of-band scripts or manual database modifications.

### Structure

Migration events are **regular graph events** (NodeCreated, NodePropertiesUpdated, etc.) tagged with migration metadata.
There is no special migration event type.

Migration metadata includes:

- **MigrationId**: unique identifier for this migration.
- **MigrationVersion**: the application version that triggered the migration.
- **MigrationName**: human-readable name (e.g., "add-scheduled-time-property-type").

The metadata is attached to each event produced by the migration.
It distinguishes migration-produced events from user-produced events in the log.

### What migrations can do

Migrations can:

- Create new system type nodes (new NodeType, EdgeType, PropertyType definitions).
- Modify existing type definitions (add optional properties, update metadata).
- Modify existing nodes to conform to updated schemas (add required properties with default values).
- Create new system edges, views, renderers, or settings schemas.

Migrations emit the same event types as any other operation.
The graph does not know or care whether an event came from a user action or a migration.

### Avoiding corrupt states

Migrations must leave every node in a valid state according to the updated schema.
If a migration adds a required property to a type, it must also emit `NodePropertiesUpdated` events for all existing nodes of that type, setting the new property to a default value.

The migration is responsible for completeness.
The system should validate the graph after migration projection to confirm integrity.

### Reversibility

Migrations are not inherently reversible.
If a downgrade is needed, a compensating migration must be written that emits events to undo the changes.

An application version should ignore events it does not understand.
If v1 encounters events from a v2 migration, it skips them during projection (they reference types or properties v1 doesn't know about).

> **Open question**: exact behavior when encountering unknown event payloads during projection.
> Options: skip silently, skip with warning, or fail.
> Skipping with warning is the current recommendation.

---

## 5. Batch semantics

### Principle

Some operations are logically atomic.
Creating a node and its required edges, or updating multiple related properties, should succeed or fail as a unit.

### Individual events with batch correlation

Batched events are **individual events** that share a **batchId**.
There is no batch wrapper type.
Each event stands alone in the event log.

The batchId is a UUIDv7 that appears in the metadata of each event in the batch.
Events without a batchId are standalone (implicitly a batch of one).

### Projection behavior

During projection, if any event in a batch fails validation or application, the entire batch is rejected.
No partial application of batched events.

The projection engine detects batch boundaries by observing batchId changes in the event stream.
Events with the same batchId are collected and applied atomically.

### Event log behavior

In the event log, batched events are stored as individual entries.
The log does not treat batches specially.
Batch atomicity is a projection concern, not a storage concern.

### Sync behavior

During sync, batched events may arrive interleaved with other events.
The sync layer must ensure that all events in a batch arrive before projection processes any of them.

> **Open question**: how the sync layer guarantees batch completeness when events arrive incrementally.
> Options: buffer until batch is complete, or project optimistically and roll back if incomplete.

---

## 6. Validation

### Validate before insertion

Events are validated before being appended to the log.
Invalid events are rejected; they never enter the log.

Validation checks:

- **Structural validity**: the event payload matches the expected schema for its event type.
- **Referential integrity**: referenced NodeIds, EdgeIds, and TypeIds exist in the current graph state (for updates and deletes) or are being created in the same batch (for new references).
- **Type conformance**: new nodes conform to their NodeType definition (required properties present, correct types).
- **Namespace rules**: events targeting the system namespace are only accepted from bootstrap, migration, or application-internal sources.

### Concurrent conflicts are not validation failures

Two devices can independently produce valid events that conflict when merged.
For example, both update the same property on the same node at the same millisecond.

This is not a validation error.
Both events are individually valid.
Conflict resolution happens during projection, not validation.

### Projection applies conflict resolution rules

When conflicting events are projected, the system applies deterministic resolution rules:

- **Last-write-wins per property**: the event with the later timestamp (or higher device ID tiebreaker) wins for each property independently.
- **Edge creation is additive**: two devices creating different edges is not a conflict; both edges exist.
- **Node deletion is a tombstone**: a deleted node stays deleted; concurrent updates to a tombstoned node have no effect on projection but remain in the event log for history.

These rules produce a deterministic graph state from any set of valid events, regardless of the order they arrive.

This section is the canonical definition of conflict resolution.
Other docs (sync, settings) reference these rules but do not redefine them.

---

## 7. Event lifecycle

The full lifecycle of an event from creation to materialization:

```
1. operation (user action, API call, migration, workflow)
   ↓
2. event generation (operation produces one or more events)
   ↓
3. validation (structural, referential, type, namespace checks)
   ↓
4. append to event log (immutable, append-only)
   ↓
5. sync (distribute to other devices via event replication)
   ↓
6. projection (apply events to materialized graph view)
   ↓
7. notification (inform query caches, live queries, renderers of changes)
```

Steps 5 and 6 may happen in different orders depending on context:

- **Local events**: validated → appended → projected → synced.
- **Remote events**: received via sync → validated → appended → projected.

In both cases, validation happens before the event enters the local log.

---

## 8. Tombstones and deletion

Node deletion produces a `NodeDeleted` event.
The node is not physically removed from the graph.
It is marked as a tombstone: present in the graph but flagged as deleted.

Tombstoned nodes:

- Are excluded from query results by default.
- Can be included in query results with an explicit flag (for admin, debugging, or undo).
- Retain all their properties and edges in the event log (full history preserved).
- Win over concurrent updates (delete-wins semantics).

Edges involving a tombstoned node are implicitly inactive but not deleted.
They remain in the log and can be reasoned about for history and audit purposes.

> **Open question**: tombstone garbage collection.
> Over time, tombstones accumulate.
> A compaction process could remove tombstoned nodes from the materialized view (not from the event log).
> Timing, triggers, and user control over compaction are TBD.

---

## 9. Event log compaction (future)

The event log grows indefinitely.
For long-lived vaults, replay from the beginning becomes expensive.

Compaction strategies:

- **Snapshotting**: store a full graph state at a point in time; replay only from the snapshot forward.
- **Event folding**: collapse sequential updates to the same entity into a single event (lossy — destroys intermediate history).
- **Archival**: move old events to cold storage; keep recent events hot.

Snapshotting is the least destructive and most aligned with the system's values (full history preservation).
Event folding and archival are tradeoffs that sacrifice history for performance.

> **Open question**: which compaction strategies to support and whether users control compaction policy.

---

## 10. What this document does not cover

| Concern                              | Where it belongs                                             |
| ------------------------------------ | ------------------------------------------------------------ |
| Sync protocol and transport adapters | [Sync](2026-02-08-sync.md)                                   |
| Storage engine event persistence     | [Storage layer](2026-02-08-storage-layer.md)                 |
| Workflow execution events            | [Workflow system](2026-02-08-workflow-system.md)             |
| API layer event submission           | [Query engine](2026-02-08-query-engine.md) (external access) |
| Undo/redo grouping                   | UI/interaction design                                        |

---

## 11. Open questions

1. Exact mechanism for encoding device/client ID into UUIDv7 random bits.
2. Whether causal ordering metadata (`causedBy` references) adds value.
3. Behavior when encountering unknown event payloads during projection (skip, warn, or fail).
4. How the sync layer guarantees batch completeness when events arrive incrementally.
5. Tombstone garbage collection: timing, triggers, and user control.
6. Event log compaction strategy: snapshotting vs folding vs archival.
7. Whether events carry a schema version tag so old clients can detect incompatible events.
8. Maximum batch size limits to prevent unbounded atomic operations.
