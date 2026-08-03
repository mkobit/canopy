# Design: Domain-aligned CLI command architecture (`apps/cli`)

## Context

Canopy is a graph-based personal knowledge management system. Its canonical design document (`docs/design/2025-01-21-canopy-design-v0.1.md`) defines core domain concepts: Nodes, Edges, Types/Schema, Queries, Events/Event-Log, and View Definitions.

Previously, `apps/cli` exposed experimental commands (`node`, `edge`, `handshake`). The `handshake` command was an ad-hoc protocol test endpoint, while core domain capabilities like inspecting schema types, running queries, tailing event logs, and checking daemon connectivity were either missing or misplaced.

This design establishes a clean, domain-aligned command architecture for `apps/cli` that reflects Canopy's core data and system model.

## Goals / non-goals

### Goals

- Align `apps/cli` command hierarchy strictly with core domain concepts: `node`, `edge`, `types`, `query`, `events`, and `status`.
- Fold the protocol handshake into `canopy status` (and `canopy status --json`), removing standalone `canopy handshake`.
- Implement `canopy status` (with alias `canopy daemon status`) outputting `gh auth status`-style human-readable daemon state and socket connectivity info, or structured JSON when `--json` is supplied.
- Implement `canopy events tail` to subscribe to live graph event streams over the IPC socket connection (`canopy.v1.eventStream.subscribe`).
- Provide consistent CLI options (`--socket-path`, `--json`) across all subcommands using Effect CLI (`@effect/cli`).
- Guarantee clean exit codes (0 on success, non-zero on error or unreachable socket status).

### Non-goals

- Implementing background process management (`start`/`stop` daemon background runners) inside `apps/cli` (daemon process management belongs to environment supervisors like systemd or Docker).
- Adding complex interactive TUI interfaces in this iteration.

## Decisions

### Decision 1: Domain-aligned command taxonomy

The `canopy` CLI command tree will be structured around core domain entities:

```
canopy
├── node                # Graph Node operations (get, list, create, update, delete)
├── edge                # Graph Edge operations (get, list, create, delete)
├── types               # Schema and type definition operations (list, get)
├── query               # Query DSL execution (execute)
├── events              # Event log operations (tail)
└── status              # Inspect daemon connection, API/server version, capabilities, session status
    (alias: daemon status)
```

### Decision 2: Fold protocol handshake into `canopy status`

The standalone `canopy handshake` command is removed. `canopy status` automatically executes `canopy.v1.handshake` against the configured IPC socket path.

Output in human-readable mode (`gh auth status` style):

```
Canopy IPC Daemon Status
  ✓ Socket connected (/tmp/canopy.sock)
  ✓ API version: v1
  ✓ Server version: 0.1.0
  ✓ Capabilities: queries, mutations, subscriptions
  ✓ Active session: Ready
```

Output in JSON mode (`canopy status --json`):

```json
{
  "connected": true,
  "socketPath": "/tmp/canopy.sock",
  "apiVersion": "v1",
  "serverVersion": "0.1.0",
  "capabilities": ["queries", "mutations", "subscriptions"],
  "activeSession": "ready"
}
```

If the socket connection fails (e.g. `ECONNREFUSED` or file missing):

```
Canopy IPC Daemon Status
  x Socket disconnected (/tmp/canopy.sock - ENOENT)
```

And exits with code 1.

### Decision 3: Event stream tailing under `canopy events tail`

`canopy events tail` connects to the IPC socket and issues `canopy.v1.eventStream.subscribe`. It listens for `canopy.v1.eventStream.event` notifications and streams them line-by-line to `stdout` until SIGINT / Ctrl+C.

Options:

- `--socket-path`: Socket file path (default: `CANOPY_SOCKET_PATH` or `tmp/canopy.sock`)
- `--graph-id`: Optional graph ID filter
- `--from-sequence`: Optional starting sequence number
- `--json`: Output raw NDJSON lines vs formatted event records

## Adversarial review and mitigations

### Resource and performance overhead

#### Risk

Tailing live events over `canopy events tail` could buffer excessive lines in memory or block process exit on Ctrl+C.

#### Mitigation

- Stream events directly to stdout without storing historical event payloads in memory.
- Register SIGINT / SIGTERM signal traps in Effect TS to gracefully close the socket connection (`client.close()`) upon termination.

### Failure modes and edge cases

#### Risk

Calling `canopy status` when the IPC socket path does not exist or is stale returns an unhandled exception or stack trace.

#### Mitigation

- `makeIpcClient` returns a branded `IpcClientError`. `canopy status` catches `IpcClientError` gracefully, displays `x Socket disconnected (<socketPath> - <reason>)`, and exits cleanly with exit code 1.

### Security and isolation

#### Risk

CLI socket path option could allow writing or reading arbitrary Unix domain sockets without validation.

#### Mitigation

- Validate socket path using standard file system access checks and restrict socket creation permissions (`0o700` parent dir, umask `0o177`).

### Migration and backward compatibility

#### Risk

Existing scripts calling `canopy handshake` will break when the command is removed.

#### Mitigation

- Deprecate `canopy handshake` by aliasing it to `canopy status` or printing a deprecation notice pointing users to `canopy status`.

## Testing strategy

### Unit & Integration testing

- Test `canopy status` when IPC server is running (returns success, prints formatted output, outputs JSON with `--json`).
- Test `canopy status` when IPC server is offline (returns failure exit code 1, prints clear disconnected status).
- Test `canopy events tail` receiving mock subscription events over IPC socket.
- Test `canopy node`, `canopy edge`, `canopy types`, and `canopy query` subcommands against IPC server.
