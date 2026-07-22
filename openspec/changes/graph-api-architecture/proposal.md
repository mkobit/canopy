## Why

Clients and consumers currently require a high-level, graph-centric interface to query nodes, edges, and properties directly without reconstructing state from raw event streams.
Exposing graph-centric API abstractions over GraphQL, gRPC, and WASM WIT enables external clients and extensions to operate on domain concepts cleanly.
Low-level event logs remain the internal event-sourced storage layer, but API consumers require structured queries, validated mutations, and optional event stream subscriptions.

## What changes

- Define high-level graph API endpoints for queries (nodes, edges, node properties, graph traversals) and mutations (creating, updating, and deleting nodes and edges).
- Integrate write operations with `GraphSession` to validate operational events, append them to the `EventLogStore`, and project graph state changes atomically.
- Expose an optional event log streaming interface alongside projected graph API access for clients requiring subscription updates or event synchronization.
- Introduce a new API server/adapter package to host transport protocols (GraphQL, gRPC, and WASM WIT) and bind them to `@canopy/graph` and `@canopy/queries`.

## Capabilities

### New capabilities

- `graph-api-access`: The graph-centric API layer exposing nodes, edges, and properties over GraphQL, gRPC, and WASM WIT, with mutation integration through `GraphSession` and optional event log stream access.

### Modified capabilities

(none)

## Impact

- `@canopy/graph`: Provides graph state representation and `GraphSession` binding for API write mutation execution.
- `@canopy/queries`: Powers structured query execution for projected nodes, edges, and properties across API transport layers.
- `@canopy/api-adapter`: New package containing transport adapters, schema definitions, gRPC services, and WASM WIT host bindings for high-level graph API access.
