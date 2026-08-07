# indexed-read-model Specification

## Purpose

A read-model abstraction the query executor targets instead of re-scanning the graph on every step.
Defines a port in `@canopy/graph` for index-shaped lookups (typed node IDs, adjacency, property-equality) with an optional whole-pipeline push-down hook, backed today by an in-memory implementation maintained inside the incremental projection fold.

## Requirements

### Requirement: Read-model port

The system SHALL define a read-model port in `@canopy/graph` that exposes index-shaped lookups over a graph's nodes and edges without requiring callers to scan the full node or edge collections.
The port SHALL expose, at minimum, typed node lookup, adjacency lookup by edge type and direction, and property-equality lookup, and SHALL expose an optional whole-pipeline execution hook that a backend MAY implement to bypass step-by-step interpretation.
The port SHALL live in `@canopy/graph` so it stays a dependency-free leaf and any downstream package can implement it.

#### Scenario: Typed node lookup avoids full scan

- **WHEN** a caller requests all node IDs of a given type from the read model
- **THEN** the read model SHALL return the matching node IDs without iterating every node in the graph

#### Scenario: Adjacency lookup by edge type and direction

- **WHEN** a caller requests the neighbours of a node for a given edge type and direction (`out`, `in`, or `both`)
- **THEN** the read model SHALL return the connected node IDs without iterating every edge in the graph

#### Scenario: Optional push-down hook reports coverage

- **WHEN** a backend does not implement whole-pipeline push-down for a given query
- **THEN** the push-down hook SHALL report that the query is not covered so the executor can fall back to step interpretation

### Requirement: In-memory indexed implementation

The system SHALL provide an in-memory implementation of the read-model port that maintains a type index, an adjacency index, and a property-equality index for the current projected graph.
The implementation SHALL extend the existing `GraphIndexes` structure and SHALL be maintained inside the incremental projection fold, so the indexes are always consistent with the projected `Graph`.
Index fields SHALL remain additive and optional on `GraphIndexes`, so code paths that never consult the read model continue to operate via scanning.

#### Scenario: Index maintained incrementally on mutation

- **WHEN** an event is applied during incremental projection (node created, edge created, properties updated, node or edge deleted, including cascaded edge removal)
- **THEN** the type, adjacency, and property-equality indexes SHALL be updated in proportion to the change, not rebuilt from a full graph scan

#### Scenario: Parked events do not update the index

- **WHEN** an event is held in the pending buffer because its dependencies are not yet satisfied
- **THEN** the read-model indexes SHALL NOT reflect that event until it is actually applied to the graph

### Requirement: Index-assisted query execution

The query executor SHALL consult the read model for `node-scan` by type, `traversal`, and equality `filter` steps instead of scanning the full graph.
For any step or predicate the read model does not cover (for example `contains`, `starts-with`, `gt`, or an unindexed property), the executor SHALL fall back to a full scan so that results are identical to the pre-change executor.
The executor's public contract `(graph, query) => Result<QueryResult, Error>` and the `QueryResult` shape SHALL be unchanged.

#### Scenario: Indexed step uses the read model

- **WHEN** a query performs a `node-scan` by type followed by a `traversal` over a known edge type
- **THEN** the executor SHALL resolve both steps through the read model rather than scanning all nodes and all edges

#### Scenario: Unindexed predicate falls back to scan

- **WHEN** a query filters with a non-equality operator or on an unindexed property
- **THEN** the executor SHALL fall back to scanning and SHALL return the same result set the pre-change executor would return

#### Scenario: Result parity with scan-only execution

- **WHEN** the same query is executed against the indexed executor and against a scan-only reference executor for an arbitrary graph
- **THEN** both SHALL return equal result sets

### Requirement: Index is a pure derivation of graph state

The read-model indexes SHALL be a deterministic pure function of the projected graph, so that convergence of the graph implies convergence of the indexes without a separate proof.
The index built incrementally SHALL equal the index built from scratch over the same converged graph.

#### Scenario: Incremental index equals rebuilt index

- **WHEN** any permutation and partition of a valid event set is applied incrementally
- **THEN** the resulting read-model indexes SHALL equal the indexes built from scratch over `projectGraph` of the sorted event set
