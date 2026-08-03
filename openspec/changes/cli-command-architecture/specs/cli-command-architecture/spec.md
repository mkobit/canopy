# CLI Command Architecture Spec

## ADDED Requirements

### Requirement: Domain-aligned CLI command architecture

The Canopy CLI (`apps/cli`) MUST organize commands under domain entity subcommands (`node`, `edge`, `types`, `query`, `events`, `status`).

#### Scenario: Inspect daemon status and socket connectivity

- **WHEN** `canopy status` or `canopy daemon status` is executed against an active IPC socket
- **THEN** it MUST perform the `canopy.v1.handshake` protocol call and output socket connectivity, API version, server version, capabilities, and active session status
- **AND** when `--json` is specified, it MUST output formatted JSON

#### Scenario: Inspect daemon status when socket is offline

- **WHEN** `canopy status` is executed and the IPC socket is disconnected or unreachable
- **THEN** it MUST display `x Socket disconnected` status and exit with a non-zero exit code

#### Scenario: Stream live graph event notifications

- **WHEN** `canopy events tail` is executed against an active IPC socket
- **THEN** it MUST subscribe via `canopy.v1.eventStream.subscribe` and stream live event notifications to stdout until SIGINT / Ctrl+C
