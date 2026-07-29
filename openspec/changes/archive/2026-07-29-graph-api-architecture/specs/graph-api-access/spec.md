## ADDED Requirements

### Requirement: Querying projected graph state

The graph API layer SHALL expose endpoints over GraphQL, gRPC, and WASM WIT to query projected nodes, edges, and properties without requiring clients to process low-level event logs.

#### Scenario: Querying nodes and properties

- **WHEN** a client queries nodes by type or property criteria over GraphQL, gRPC, or WASM WIT
- **THEN** the system SHALL execute the query against `@canopy/queries` and return matching projected node entities with their current properties

#### Scenario: Querying edge relationships

- **WHEN** a client requests outbound or inbound edge traversals for a given node identifier
- **THEN** the system SHALL return the connected projected edges and target node summaries

### Requirement: Executing graph mutations through GraphSession

The graph API layer SHALL route all node and edge mutation requests through `GraphSession` to validate graph operation events, append them to the `EventLogStore`, and apply them to projected graph state.

#### Scenario: Mutating graph state via GraphSession

- **WHEN** a client submits a mutation to create, update, or delete nodes or edges
- **THEN** the system SHALL convert the mutation into graph operation events, validate the payload, and commit them via `GraphSession`
- **AND** the system SHALL return the resulting projected graph entity state to the caller

#### Scenario: Rejecting invalid mutation payloads

- **WHEN** a client submits a mutation payload that fails referential, schema, or structural validation
- **THEN** `GraphSession` SHALL reject the commit, return a descriptive error Result, and prevent event log appends

### Requirement: Streaming event log updates

The graph API layer SHALL support an optional event log streaming interface to deliver real-time event notifications to subscribing clients alongside graph query and mutation endpoints.

#### Scenario: Subscribing to live event updates

- **WHEN** a client opens an event stream subscription for a graph
- **THEN** the system SHALL emit newly appended operational events in real time as mutations complete through `GraphSession`

#### Scenario: Catching up on missed events

- **WHEN** a streaming client provides a last-seen event identifier upon subscribing
- **THEN** the system SHALL replay unacknowledged events from `EventLogStore` before streaming new live events
