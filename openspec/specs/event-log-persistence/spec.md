# event-log-persistence Specification

## Purpose
The event log as the persisted source of truth: per-backend storage packages, the IndexedDB `EventLogStore`, and the dependency-free in-memory contract implementation in `@canopy/storage`.

## Requirements
### Requirement: The event log is the only persisted source of truth
Graph persistence SHALL consist of appending `GraphEvent`s to an `EventLogStore`; the materialized graph SHALL be derived state, rebuildable from the log alone.
The system SHALL NOT persist opaque CRDT snapshots as graph state.

#### Scenario: Reload reconstructs state from events alone
- **WHEN** the application restarts and loads a graph
- **THEN** the graph state SHALL be produced by projecting the persisted event log, with no other persisted graph-state input

### Requirement: Storage backends live in per-backend packages
`@canopy/storage` SHALL contain only the storage contract re-exports and a dependency-free in-memory `EventLogStore`.
Each backend SHALL live in its own package named for the backend it owns (`@canopy/storage-indexeddb` with `idb`, `@canopy/storage-sqlite` with `sql.js`), so a consumer's dependency graph includes only the backends it uses.

#### Scenario: Contract-only consumers stay dependency-free
- **WHEN** a package depends on `@canopy/storage` for the `EventLogStore` contract and in-memory implementation
- **THEN** its resolved dependency graph SHALL NOT include `idb`, `sql.js`, or any other backend-specific third-party dependency

### Requirement: IndexedDB event log adapter
`@canopy/storage-indexeddb` SHALL implement `EventLogStore` over IndexedDB with events keyed by `[graphId, eventId]`, deduplicating appends by eventId and serving `getEvents` in eventId order with the existing `EventLogQueryOptions` semantics (`after`, `before`, `limit`, `reverse`).

#### Scenario: Duplicate append is idempotent
- **WHEN** the same event (same eventId) is appended twice
- **THEN** the log SHALL contain the event once and both appends SHALL succeed

#### Scenario: Range query respects options
- **WHEN** `getEvents` is called with an `after` eventId and a `limit`
- **THEN** the result SHALL contain only events with eventId greater than `after`, in ascending eventId order, at most `limit` long

