# Design: Unix domain socket IPC listener transport bridge

## Context

Canopy client applications (such as `apps/cli` and headless background services) require a fast, lightweight, local-first Inter-Process Communication (IPC) transport to execute queries, trigger graph mutations, and subscribe to real-time event streams without running full HTTP/Web servers.

`@canopy/api-adapter` currently hosts core `QueryHandlers`, `MutationHandlers`, `EventStreamHandlers`, as well as protocol adapters for GraphQL, Connect-Web/gRPC, and WASM WIT.
This document details the architectural design for exposing a Unix domain socket IPC listener transport bridge in `packages/api-adapter` and consuming it in `apps/cli`.

## Goals / non-goals

### Goals

- Leverage existing ecosystem libraries (`json-rpc-2.0` / `@effect/platform/Socket`) instead of writing custom framing, RPC correlation, or JSON parsing engines from scratch.
- Implement a low-latency, local IPC listener server in `@canopy/api-adapter/src/ipc/` over Node/Bun `node:net` Unix domain sockets using NDJSON + JSON-RPC 2.0.
- Guarantee strict forward and backward compatibility (schema evolution rules, additive non-breaking fields, unknown field tolerance, and explicit capability handshakes).
- Expose unary queries, atomic graph mutations, and real-time event log subscription streaming over a single multiplexed socket connection.
- Ensure safe socket lifecycle management (directory permissions `0o700` / umask isolation, `ECONNREFUSED` probe cleanup, automatic socket drop subscription unbind, slow-consumer drain timeout, and graceful server shutdown).
- Return domain errors as structured branded result types (`Result<T, E>`) adhering to Canopy functional invariants (no generic raw `Error` throws).
- Integrate cleanly with Effect TS in `apps/cli` via `@effect/platform-node`.

### Non-goals

- Supporting TCP or remote network listening in this task (focus is strictly local Unix domain sockets).
- Writing custom message parsers or RPC state machines when `json-rpc-2.0` or `@effect/platform` provides them.
- Adding complex third-party binary serialization frameworks (e.g. Protobuf/Cap'n Proto) for local IPC.

## Decisions

### Decision 1: Leverage `json-rpc-2.0` library & NDJSON over raw `node:net` Unix domain sockets

- **Rationale**: Utilizing the lightweight `json-rpc-2.0` library provides robust JSON-RPC 2.0 request/response handling, notification routing, and correlation ID matching out of the box. NDJSON (`\n`) offers trivial framing. V8 (Node/Bun) provides hyper-optimized JSON serialization/deserialization. Developers can directly inspect and debug using `nc -U /tmp/canopy.sock`.
- **Alternatives**: Writing custom JSON-RPC routers and string parsers from scratch was rejected to avoid code bloat and maintainability burden. HTTP/2 or gRPC over UDS was rejected due to HTTP handshake overhead degrading CLI startup time.

### Decision 2: Enforce forward and backward compatibility rules in schema and router

- **Rationale**: To provide Protobuf/GraphQL-level schema evolution safety:
  1. All Zod validators use `.passthrough()` or allow additive unknown properties without rejecting payloads.
  2. All methods use versioned namespaces (`canopy.v1.query.*`, `canopy.v1.mutation.*`, `canopy.v1.eventStream.*`).
  3. Connections issue `canopy.v1.handshake` to negotiate capabilities and API versions:
     - Request:
       ```json
       {
         "jsonrpc": "2.0",
         "method": "canopy.v1.handshake",
         "params": { "clientVersion": "0.1.0", "supportedCapabilities": ["queries", "mutations", "subscriptions"] },
         "id": 1
       }
       ```
     - Response:
       ```json
       {
         "jsonrpc": "2.0",
         "result": { "apiVersion": "v1", "serverVersion": "0.1.0", "capabilities": ["queries", "mutations", "subscriptions"] },
         "id": 1
       }
       ```
  4. Missing parameters fall back to schema defaults.
- **Alternatives**: Unversioned RPC methods and strict payload rejection were rejected to prevent older clients from breaking when new fields are added to the server.

### Decision 3: Socket lifecycle, permission umask isolation, & cleanup

- **Rationale**: Unix domain socket files linger if the process terminates abruptly.
  - On startup, `createIpcServer` probes `socketPath` with `net.connect`. If the error code is `ECONNREFUSED` and the file exists, it unlinks the stale file via `fs.unlinkSync(socketPath)` before binding. (It explicitly avoids calling `unlinkSync` on `ENOENT` to prevent runtime crashes). If connection succeeds, it returns `Result.err(createIpcSocketInUseError(socketPath))` to prevent duplicate listeners.
  - Parent socket directory is created with strict `0o700` permissions and `process.umask(0o177)` is applied around `netServer.listen()` to prevent TOCTOU permission race conditions.
  - On client socket disconnect or error, the server automatically cleans up and unbinds all active event subscriptions for that connection to prevent memory leaks.
- **Alternatives**: Post-listen `chmod` created a TOCTOU permission vulnerability. Calling `unlinkSync` on `ENOENT` caused crashes when starting on clean paths.

## Adversarial review and mitigations

### Resource and performance

#### Risk

Fast event streams or slow clients causing unbounded socket write buffering and server OOM crashes.

#### Mitigation

- **Line size limits**: Enforce a maximum line length (10MB) in the NDJSON parser to reject malformed or memory-exhausting lines.
- **Slow consumer drain timeout**: Monitor `socket.write(payload)`. If `write` returns `false`, pause event stream dispatch for that subscriber and start a 15-second drain timer. If `drain` does not fire within 15 seconds, terminate the socket connection to protect server memory.

### Failure modes and edge cases

#### Risk

Abrupt daemon crashes leaving stale socket files, or `ENOENT` errors throwing on unlinking non-existent files.

#### Mitigation

- **Stale socket probe & targeted cleanup**: Probe existing socket files with `net.connect`. Only call `fs.unlinkSync(socketPath)` if `error.code === 'ECONNREFUSED'` and file exists.
- **Socket disconnect auto-cleanup**: Attach `close` and `error` handlers to client sockets to unbind all registered subscription listeners automatically upon client termination.

### Security and isolation

#### Risk

Permission race condition when creating sockets under default umask, allowing unauthorized local users access before `chmod`.

#### Mitigation

- **Directory permissions & umask isolation**: Require parent runtime directory `0o700` permissions (`~/.canopy/run/`) and apply umask `0o177` during `listen()` call so socket is created owner-only from the start.

### Migration and backward compatibility

#### Risk

API updates introducing new fields breaking older client parsers, or removal of methods breaking legacy CLI versions.

#### Mitigation

- **Additive schema design**: Zod schema `.passthrough()` tolerance for unknown keys.
- **Versioned namespaces**: Preserve `canopy.v1.*` handlers when introducing future `canopy.v2.*` methods.
- **Capability handshake**: `canopy.v1.handshake` endpoint lets clients verify server features.

## Testing strategy

### Unit testing

- Test NDJSON line buffer parsing (partial chunks, back-to-back messages, oversized lines).
- Test JSON-RPC 2.0 error mapping (`Result<T, E>` to standard JSON-RPC error codes).

### Integration testing

- Test socket lifecycle: server startup, umask/directory permissions verification, stale socket cleanup, client connection, unary query/mutation RPC calls, subscription event streaming, disconnect auto-cleanup, and graceful shutdown.
- Test forward/backward compatibility: client sending unknown extra fields; server returning additive fields.
- Test Effect TS client in `apps/cli` against running IPC server.

---
