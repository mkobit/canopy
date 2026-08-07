## Why

Clients and automation tools (such as `apps/cli` and local headless daemons) require a lightweight, zero-dependency, local-first Inter-Process Communication (IPC) transport to execute queries, trigger graph mutations, and stream event logs without running a full HTTP/Web server.

Exposing an IPC Unix domain socket listener bridge in `@canopy/api-adapter` allows client applications to connect over local sockets, receive typed RPC responses, and subscribe to real-time event log updates with low latency and minimal startup overhead.

## What changes

- Introduce `IpcServer` in `@canopy/api-adapter/src/ipc/` listening on a Unix domain socket (`node:net`).
- Implement Newline-Delimited JSON (NDJSON) framing with standard JSON-RPC 2.0 payloads.
- Implement explicit forward and backward compatibility guarantees (versioned method namespaces `canopy.v1.*`, `.passthrough()` Zod validation for additive properties, and `canopy.v1.handshake` capability negotiation).
- Integrate IPC dispatch with `@canopy/api-adapter` (`QueryHandlers`, `MutationHandlers`, `EventStreamHandlers`).
- Enforce socket hygiene and security (`0o600` permissions, stale socket probe & `ECONNREFUSED` cleanup via `fs.unlinkSync`, and backpressure handling).
- Build the client-side `IpcClient` adapter in `apps/cli` using Effect TS (`@effect/platform-node`).

## Capabilities

### New capabilities

- `unix-socket-ipc-transport`: Unix domain socket IPC listener server and client transport layer providing low-latency, framed JSON-RPC 2.0 query execution, graph mutations, and event stream subscriptions.

### Modified capabilities

(none)

## Impact

- `@canopy/api-adapter`: New `src/ipc/` subpath containing IPC server, JSON-RPC router, and framing protocol handlers.
- `apps/cli`: Client-side IPC socket client integration using Effect TS (`@effect/platform-node`).
- `@canopy/graph` & `@canopy/queries`: Indirectly consumed via existing `@canopy/api-adapter` handlers.
