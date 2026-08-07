## ADDED Requirements

### Requirement: Query session projection load testing under 10k+ nodes

`@canopy/queries` SHALL provide a layer-isolated load test suite that measures `GraphSession` initial fold projection and query execution engine performance under 10,000+ nodes and 20,000+ edges.

#### Scenario: GraphSession fold projection performance under 10k nodes
- **GIVEN** an `EventLogStore` containing 10,000 node creation events and 20,000 edge creation events generated deterministically
- **WHEN** a `GraphSession` is initialized over the event log
- **THEN** the initial graph projection SHALL complete within 250 milliseconds

#### Scenario: Query engine node scan and property filter under 10k nodes
- **GIVEN** a `GraphSession` populated with 10,000 nodes and 20,000 edges
- **WHEN** a `Query` with `node-scan` and `filter` steps is executed against the projected graph
- **THEN** query execution SHALL return matching results within 15 milliseconds

#### Scenario: Query engine 1-hop traversal under 10k nodes and 20k edges
- **GIVEN** a `GraphSession` populated with 10,000 nodes and 20,000 edges
- **WHEN** a `Query` with `traversal` steps is executed from a set of starting nodes
- **THEN** traversal query execution SHALL return connected target nodes within 25 milliseconds

#### Scenario: Incremental re-projection performance under mutation
- **GIVEN** an active `GraphSession` containing 10,000 nodes
- **WHEN** a single property update or node creation event is committed to the session
- **THEN** incremental re-projection and change notifications SHALL complete within 2 milliseconds
