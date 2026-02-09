# Storage layer

> Status: **draft**
> Scope: event storage, materialized view storage, adapter interface, snapshot strategy
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md), [2026-02-08-event-system.md](2026-02-08-event-system.md), [2026-02-08-sync.md](2026-02-08-sync.md)

---

## 1. Principles

The storage layer persists two things: **events** and **materialized graph state**.
Events are the source of truth.
The materialized graph state is a derived, rebuildable view.

The storage layer is an abstraction.
Different deployment scenarios use different storage backends.
The rest of the system interacts with storage through a common interface.

---

## 2. Two storage concerns

### Event storage

The event log is append-only and immutable.
Event storage must support:

- **Append**: add new events to the log, deduplicated by EventId.
- **Read all**: load the full event log (for initial projection or full rebuild).
- **Read from offset**: load events after a given point (for incremental projection after a snapshot).
- **Read by filter**: load events matching criteria (by node, by type, by time range) for history queries.

Event storage does not support update or delete.
Events are never modified after creation.

### Materialized view storage

The projected graph state needs persistence so it doesn't have to be rebuilt from events on every startup.
Materialized view storage must support:

- **Read nodes**: by ID, by type, by property filter.
- **Read edges**: by ID, by type, by source/target node.
- **Write nodes/edges**: update the materialized state when new events are projected.
- **Traversal**: efficiently follow edges from a node (inbound, outbound, by type).

The materialized view is rebuildable.
If it becomes corrupted or out of sync, it can be discarded and rebuilt from the event log.

---

## 3. Adapter interface

All storage backends implement a common interface.
The system does not interact with storage directly; it goes through the adapter.

### Event store interface

```
append(events: Event[]) -> Result
  Append events to the log. Deduplicate by EventId.

loadAll() -> Event[]
  Load the full event log, ordered by timestamp.

loadFrom(afterEventId: EventId) -> Event[]
  Load events after the given EventId, ordered by timestamp.

loadByFilter(filter: EventFilter) -> Event[]
  Load events matching filter criteria (node, type, time range).
```

### Graph store interface

```
getNode(id: NodeId) -> Node | null
  Load a single node by ID.

getNodes(filter: NodeFilter) -> Node[]
  Load nodes matching filter criteria.

getEdges(filter: EdgeFilter) -> Edge[]
  Load edges matching filter criteria.

getEdgesFrom(nodeId: NodeId, edgeType?: TypeId) -> Edge[]
  Load outbound edges from a node, optionally filtered by type.

getEdgesTo(nodeId: NodeId, edgeType?: TypeId) -> Edge[]
  Load inbound edges to a node, optionally filtered by type.

applyEvents(events: Event[]) -> Result
  Update the materialized state by applying projected events.
```

These interfaces are pseudocode representing the contract.
The actual implementation uses the language's type system and error handling.

---

## 4. Snapshot strategy

Replaying the full event log on every startup is expensive for mature vaults.
Snapshots provide a fast-start mechanism.

A **snapshot** is a serialized copy of the full materialized graph state at a specific event.
On startup, the system loads the snapshot and replays only events that occurred after the snapshot's event.

### Snapshot properties

- **Snapshot EventId**: the last event included in the snapshot.
- **Graph state**: the full node and edge set at that point.
- **Timestamp**: when the snapshot was created.

### Snapshot lifecycle

- Snapshots are created periodically (e.g., after N events, on shutdown, on user request).
- Old snapshots can be discarded once a newer one exists.
- Snapshots are an optimization, not a requirement. The system must always be able to rebuild from the full event log.

### Snapshot and sync

When a new device joins and needs the full vault, it can receive:

1. A snapshot (fast, gets to a recent state immediately).
2. Events after the snapshot (incremental catch-up).
3. Or the full event log (slow but complete, if no snapshot is available).

> **Open question**: snapshot format and whether it is standardized across storage backends.
> A portable snapshot format would allow migrating between backends.

---

## 5. Storage backends

### In-memory

The simplest backend.
Events stored in an array.
Graph state stored in maps.

Suitable for: tests, small vaults, short-lived sessions.
Not suitable for: persistence across restarts, large vaults.

### Embedded database

A local database (SQLite, or a graph-native embedded DB) for both events and materialized state.

Suitable for: desktop apps, single-device use, medium-to-large vaults.
Provides persistence, indexing, and efficient queries without external infrastructure.

### Graph database

A dedicated graph database (e.g., Neo4j or similar) for the materialized view.
Events may be stored in the graph DB or in a separate event store.

Suitable for: power users, large vaults, complex query workloads.
Provides native graph traversal, GQL support, and built-in indexing.
The query engine can push queries down to the database for native execution.

### Cloud / managed

A cloud-hosted storage service.
Events stored in a managed event store or object storage.
Materialized view in a hosted graph database.

Suitable for: multi-device sync, shared vaults, users who prefer managed infrastructure.

### File-based

Events stored as files in a directory.
One file per event, or append-only log files.
Materialized view rebuilt on startup from events.

Suitable for: filesystem-sync deployments (Google Drive, Dropbox).
The event files are the sync artifact; the filesystem sync tool handles replication.

---

## 6. Backend selection

The storage backend is a deployment-time decision, not a design-time decision.
The system should support swapping backends without changing application code.

A user might start with file-based storage (synced via Google Drive), and later migrate to an embedded graph database as their vault grows.
Migration means: export the event log from the old backend, import it into the new backend, rebuild the materialized view.

The event log is the portable artifact that makes this possible.

---

## 7. Indexing

Indexing is a storage backend concern (see query engine doc, section 6).
The storage layer exposes index hints to the query planner but does not define indexing strategy.

Backends that support indexing should optimize for common query patterns:

- Node lookup by type.
- Node lookup by property value.
- Edge traversal by source/target and type.
- Temporal ordering (created/modified time).

Backends without indexing (in-memory, file-based) use brute-force scans.
This is acceptable for small vaults and degrades predictably as size increases.

---

## 8. Event log and materialized view consistency

The materialized view is eventually consistent with the event log.
After new events are appended, there is a window where the view is stale.

For local operations, this window is negligible (projection runs immediately after append).
For remote events arriving via sync, the window depends on projection scheduling.

If the materialized view is ever suspected to be inconsistent, it can be rebuilt from the event log.
This is a recovery operation, not a normal flow.

---

## 9. What this document does not cover

| Concern                             | Where it belongs     |
| ----------------------------------- | -------------------- |
| Sync protocol and transport         | Sync design          |
| Query execution and planning        | Query engine         |
| Event validation rules              | Event system         |
| Specific database product selection | Implementation phase |
| Cloud infrastructure architecture   | Deployment design    |

---

## 10. Open questions

1. Portable snapshot format across storage backends.
2. Whether the event store and graph store can be different backends (e.g., events in files, materialized view in SQLite).
3. Snapshot creation triggers: periodic, event-count-based, on-shutdown, on-demand, or combination.
4. Event log archival strategy for very large vaults (cold storage for old events).
5. Whether the adapter interface should support transactions (atomic read-modify-write for the materialized view).
6. Migration tooling for switching between storage backends.
7. Encryption at rest: whether the storage layer handles encryption or whether it is a concern of the layer above.
8. How the file-based backend handles concurrent writes from multiple processes on the same device.
