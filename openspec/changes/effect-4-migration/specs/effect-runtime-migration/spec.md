# Effect runtime migration

## ADDED Requirements

### Requirement: Application and adapter packages use one compatible Effect package family

The application and adapter packages that consume Effect SHALL build and run with one compatible pinned Effect 4 package family.
The `effect` and `@effect/platform-node` packages SHALL use the same approved release version.
The CLI and daemon SHALL NOT directly depend on the removed Effect 3 `@effect/cli` or `@effect/platform` packages.

#### Scenario: Frozen install resolves the approved package family

- GIVEN the approved dependency manifests and lockfile
- WHEN the integration owner runs `bun install --frozen-lockfile` and `bun pm ls --all`
- THEN the install succeeds without changing the lockfile
- AND every direct Effect runtime dependency resolves to the approved Effect 4 version
- AND the CLI and daemon do not resolve `@effect/cli` or `@effect/platform`
- AND the build succeeds without adding Effect to `@canopy/graph`

### Requirement: IPC and CLI behavior remains compatible

The migration SHALL preserve the existing IPC wire contract and CLI observable behavior.
The migration SHALL preserve current event order, event IDs, error mapping, command output, and command exit behavior.

#### Scenario: Existing CLI invocations keep their results

- GIVEN the approved base revision and migration revision
- WHEN the existing CLI command test invocations run with the same arguments
- THEN command names, help output, argument parsing, default values, results, error text, and exit status match the approved base
- AND all existing assertions in `apps/cli/tests/cli-commands.test.ts`, `events-command.test.ts`, `status-command.test.ts`, and `types-and-query-commands.test.ts` remain enabled and pass

#### Scenario: IPC requests keep their contract

- GIVEN a client connected through the real Unix socket
- WHEN it performs the existing handshake, request, subscription, mutation, and disconnect scenarios
- THEN JSON-RPC framing, method names, capability negotiation, typed error mapping, socket permissions, and cleanup match the [IPC transport specification](../../../../specs/unix-socket-ipc-transport/spec.md)
- AND graph changes continue to use the existing commit path

### Requirement: Persisted events survive a daemon restart

The migration SHALL preserve event-log persistence and replay behavior across a real daemon restart.

#### Scenario: A mutation sent through IPC is readable after restart

- GIVEN a daemon using a temporary SQLite event-log file and a real Unix socket
- WHEN a client commits a graph mutation through IPC, the daemon closes, and a new daemon starts with the same database file
- THEN the client can read the committed graph state after restart
- AND the persisted event content and replayed state match the [event persistence specification](../../../../specs/event-log-persistence/spec.md)

### Requirement: Cancellation and process shutdown release scoped resources

The migration SHALL preserve scoped cleanup when a client operation is interrupted or the daemon receives `SIGINT` or `SIGTERM`.
The daemon SHALL close its listener, terminate active connections, clear subscriptions, and remove its socket path before successful shutdown.

#### Scenario: An interrupted IPC operation releases its resources

- GIVEN an IPC operation waiting on a real socket callback
- WHEN the operation is interrupted or the peer disconnects before the response
- THEN the operation settles with the existing typed error or interruption outcome
- AND its callback listener and socket resources are released
- AND the callback resumes at most once

#### Scenario: Daemon shutdown handles both supported signals

- GIVEN a running daemon child process with its Unix socket created
- WHEN the test sends `SIGINT` and then runs the same case with `SIGTERM`
- THEN each process exits successfully within the test timeout
- AND active connections and subscriptions are closed
- AND the socket path is removed
- AND the test force-kills any process that exceeds the timeout and reports the timeout as a failure

### Requirement: Existing IPC load bounds remain satisfied

The migration SHALL keep the current IPC streaming load tests within their existing completion-time limits.

#### Scenario: Concurrent IPC handshakes remain within the existing limit

- GIVEN 50 concurrent clients
- WHEN each client completes 20 sequential handshakes in `packages/api-adapter/tests/ipc-server-streaming.load.test.ts`
- THEN all 1,000 handshakes complete in under 10 seconds

#### Scenario: Subscription pushes remain within the existing limit

- GIVEN 25 subscribers
- WHEN 50 mutations are sent and delivered to each subscriber in `packages/api-adapter/tests/ipc-server-streaming.load.test.ts`
- THEN all 1,250 subscription pushes complete in under 5 seconds
