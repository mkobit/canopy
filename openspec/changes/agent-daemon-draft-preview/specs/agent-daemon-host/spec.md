## ADDED Requirements

### Requirement: A dedicated host app hosts the IPC server with a loaded session

A dedicated host binary (`apps/daemon`) — separate from the `apps/cli` client — SHALL host the `@canopy/api-adapter` IPC server for the lifetime of a foreground process.
The host SHALL open an `EventLogStore`, create a `GraphSession`, call `session.load()` to rebuild the projection, and build an `ApiAdapterContext` whose `session` and `eventLogStore` are populated so reads resolve live and mutations have a write path.
The `apps/cli` client SHALL NOT host the server or own any part of the host's lifecycle; its client-side `daemon status` and `events` commands operate against an already-running host.

#### Scenario: Host starts and serves clients

- **WHEN** the `apps/daemon` process runs with a socket path and an event-log database path
- **THEN** it SHALL open the event log, load the session projection, and call `createIpcServer({ socketPath, context }).listen()`
- **AND** a client connecting to the socket SHALL receive a successful `canopy.v1.handshake` reporting the negotiated capabilities.

#### Scenario: Host refuses a socket already in use

- **WHEN** the host targets a socket path where a live listener already answers
- **THEN** the host SHALL fail with the `IpcSocketInUseError` surfaced by the server probe and SHALL NOT bind a second listener.

### Requirement: Host shuts down gracefully without self-daemonizing

The host SHALL release the IPC server as a scoped resource so that process termination closes active connections, unbinds subscriptions, and removes the socket file.
The host SHALL run in the foreground and SHALL NOT fork, detach, write PID files, or otherwise self-daemonize; how the host is launched, supervised, or restarted is out of scope.

#### Scenario: Graceful shutdown on interrupt

- **WHEN** the hosting process receives `SIGINT` or `SIGTERM`
- **THEN** the host SHALL call `server.close()`, destroy active sockets, clean up subscriptions, and unlink the socket file before exiting.

#### Scenario: Host does not self-daemonize

- **WHEN** the host process is started
- **THEN** it SHALL remain a foreground process for its lifetime
- **AND** it SHALL NOT fork, detach, or manage its own background lifecycle, leaving launch and supervision to an external mechanism outside this change's scope.
