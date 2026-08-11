# unix-socket-ipc-transport Specification

## Purpose

TBD - created by archiving change unix-socket-ipc-transport. Update Purpose after archive.

## Requirements

### Requirement: Unix domain socket IPC transport server

The `@canopy/api-adapter` package SHALL provide an `IpcServer` over Unix domain sockets with socket permissions `0o177` / directory `0o700` and JSON-RPC 2.0 NDJSON message framing.
The `canopy.v1.handshake` result SHALL advertise a `drafts` capability when the server supports the `canopy.v1.draft.*` method family, so clients can feature-detect the preview surface without probing individual methods.

#### Scenario: Socket server startup and client connection

- **WHEN** `IpcServer` starts listening on a Unix domain socket path
- **THEN** it SHALL enforce socket permissions `0o177` and directory permissions `0o700`
- **AND** it SHALL clean up stale socket files via `ECONNREFUSED` probe before binding.

#### Scenario: Event stream subscription and cleanup

- **WHEN** a client subscribes to a graph event stream over IPC
- **THEN** `IpcServer` SHALL push events to connected clients
- **AND** it SHALL clean up subscriptions automatically on client disconnect or slow consumer drain timeout.

#### Scenario: Handshake advertises draft support

- **WHEN** a client completes `canopy.v1.handshake` against a server that hosts the draft methods
- **THEN** the returned `capabilities` array SHALL include `drafts`
- **AND** a client MAY gate its use of `canopy.v1.draft.*` on the presence of that capability.

### Requirement: CLI IPC client interface

The `apps/cli` application SHALL provide an IPC client for communicating with the Canopy IPC server over Unix domain sockets.

#### Scenario: Client command dispatch

- **WHEN** `apps/cli` executes IPC commands against the local Canopy IPC server
- **THEN** `IpcClient` SHALL send framed JSON-RPC 2.0 requests with unique correlation IDs
- **AND** it SHALL parse responses into domain `Result` values.
