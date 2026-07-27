# Design: Graph API architecture

## Context

Clients and external integrations currently require a high-level graph interface to query nodes, edges, and properties directly.
Lower-level storage backends implement `EventLogStore` to persist event streams, but higher-level consumers need structured query capabilities, validated mutations, and real-time subscription streams.
This document details the architectural design for exposing graph API access via protocol adapters over GraphQL, Connect-Web/gRPC, and WASM WIT interfaces.

## Goals / non-goals

### Goals

- Expose high-level graph state queries against projected in-memory graphs using `@canopy/queries`.
- Execute all graph write operations through `GraphSession` kernel ops (`createNode`, `createEdge`, `updateNodeProperties`, `deleteNode`, `deleteEdge`) to ensure event validation and atomic log appends.
- Support a modular protocol abstraction layer hosting GraphQL, Connect-Web/gRPC, and WASM WIT component interfaces in `@canopy/api-adapter`.
- Provide real-time event log subscription streaming and catch-up replay capabilities for connected clients.

### Non-goals

- Replacing `EventLogStore` as the underlying event-sourced persistence mechanism.
- Implementing domain-specific search engines or external index databases beyond the `@canopy/queries` engine.

## Decisions

### Decision 1: Expose graph queries over projected `Graph` in-memory using `@canopy/queries`

- **Rationale**: Reading directly from an in-memory projected `Graph` via `@canopy/queries` provides constant-time entity lookups and fast edge traversals without scanning or replaying event streams during query execution.
  It cleanly separates the query model from persistent event log storage.
- **Alternatives**: Replaying event logs on every query was rejected due to high CPU overhead and query latency.
  Offloading queries to external SQL engines was rejected to maintain zero-dependency local-first operation.

### Decision 2: Execute graph mutations via `GraphSession` kernel ops (`createNode`, `createEdge`, `updateNodeProperties`, `deleteNode`, `deleteEdge`)

- **Rationale**: Routing all write operations through `GraphSession` kernel operations guarantees that mutations are converted into validated operational events, appended atomically to `EventLogStore`, and projected into live memory.
  This preserves event sourcing invariants across all protocol transports.
- **Alternatives**: Executing raw writes directly against storage backends was rejected because it would bypass business logic validation and corrupt graph integrity.
  Creating transport-specific write logic was rejected to avoid code duplication across protocol adapters.

### Decision 3: Support protocol abstraction (GraphQL, Connect-Web/gRPC, and WIT component interface)

- **Rationale**: Abstracting graph operations behind core adapter interfaces enables web applications (GraphQL), microservice backends (Connect-Web/gRPC), and sandboxed guest plugins (WASM WIT) to share a single unified execution engine.
  Core domain errors returned as `Result` types map canonically to transport error structures (GraphQL extensions, gRPC status codes, and WIT result types).
- **Alternatives**: Exposing only a single protocol like GraphQL was rejected because gRPC offers better streaming binary transport for services, and WIT is required for WebAssembly plugin security.

## Adversarial review and mitigations

### Resource and performance

#### Risk

In-memory graph projection memory footprint can grow rapidly for large graphs, while deep query traversals risk CPU event-loop Denial of Service.

#### Mitigation

- **Query complexity limits**: Enforce static query cost analysis and max-depth guards in GraphQL and gRPC adapters to reject computationally expensive graph traversals before execution.
- **Compact projection snapshot windowing**: Use periodic graph projection snapshots and event offset checkpointing to bound memory usage safely without breaking traversal integrity.
- **Stream backpressure and disconnect**: Implement reactive flow control for streaming subscribers; if a client subscriber falls behind past the stream buffer threshold, force a socket disconnection with a gap notification, requiring the client to resynchronize via a full graph snapshot.

### Failure modes and edge cases

#### Risk

Invalid mutation payloads, TOCTOU write races during concurrent commits, or broken streaming connections can result in inconsistent state or lost updates.

#### Mitigation

- **Atomic CAS commits**: Update `GraphSession.commit(events, expectedSequence)` to enforce atomic compare-and-swap (CAS) commits against `EventLogStore`, resolving TOCTOU race conditions.
- **Replay bounds**: Cap maximum catch-up replay length for streaming subscriptions; if the `last-seen` event ID is expired, force the client to fetch a full graph snapshot before resuming stream ingestion.
- **Transaction boundaries for WASM WIT**: Wrap WASM WIT host import calls in defensive exception guards and disable reentrancy to guarantee host state safety upon guest plugin failures.

### Security and isolation

#### Risk

Unauthorized clients could traverse into restricted graph subgraphs or execute mutations, while untrusted WASM plugins could consume excessive host resources.

#### Mitigation

- **Fine-grained traversal and mutation authorization**: Embed dynamic authorization contexts (roles, tenant scopes, ACLs) into both `@canopy/queries` read traversals and `GraphSession` write operations so that unauthorized entities and mutations are blocked automatically.
- **Scoped capability tokens and fuel limits for WIT**: Require all WASM WIT host import calls to carry explicit capability tokens and enforce fuel metering, execution timeouts, and memory quotas on WASM guest plugins.
- **Stream connection quotas**: Enforce token authentication handshakes and heartbeat keep-alives with per-IP socket quotas.

### Migration and backward compatibility

#### Risk

Protocol schema desynchronization across GraphQL, Protobuf, and WIT definitions risks runtime field drops or deserialization failures.

#### Mitigation

- **Single-source schema code generation**: Derive GraphQL SDL, Protobuf schemas, and WASM WIT definitions from a single canonical TypeScript/JSON schema manifest to prevent protocol drift.
- **Storage change invalidation**: Extend `EventLogStore` interface with event append hooks so that local single-instance `GraphSession` instances invalidate and re-project state when external appends occur.

## Testing strategy

### Unit testing

- **Query and mutation execution**: Test all query execution pipelines against projected graphs and verify that all write mutations (`createNode`, `createEdge`, `updateNodeProperties`, `deleteNode`, `deleteEdge`) produce valid operational events and expected state updates.
- **Error mapping**: Verify canonical translation of kernel `Result` errors into transport-specific error formats (GraphQL extensions, gRPC status codes, WIT result types).

### Integration testing

- **Protocol transport adapters**: Test GraphQL queries/mutations/subscriptions, Connect-Web/gRPC calls, and WASM WIT guest plugin invocations against an in-memory `GraphSession`.
- **WASM sandboxing and fuel metering**: Verify that WASM plugins exceeding memory quotas or execution fuel limits are halted safely without crashing the host process.

### Concurrency and stress testing

- **CAS write races**: Verify that concurrent `GraphSession.commit()` calls with identical sequence numbers result in one successful commit and one rejected conflict error.
- **Stream backpressure**: Verify that lagging streaming clients receive gap notifications and disconnect cleanly when buffers exceed thresholds.

### Schema drift verification

- **CI schema generation check**: Automated CI step verifies that generated GraphQL, Protobuf, and WIT schema files match the source schema manifest.
