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
- AND the resolved closure includes `@effect/platform-node-shared@4.0.3` as a transitive dependency
- AND the CLI and daemon do not resolve `@effect/cli` or `@effect/platform`
- AND the recorded resolved package closure contains no Effect 3 runtime or peer-package instances
- AND every resolved Effect-family package's declared peer ranges accept the versions resolved for those peers
- AND every resolved required peer is recorded as part of the reviewed dependency closure
- AND the lockfile remains unchanged under the frozen install
- AND the build succeeds without adding Effect to `@canopy/graph`

#### Scenario: Incompatible resolved closure stops implementation

- GIVEN the proposed exact direct pins and the resolved package metadata
- WHEN any Effect-family peer range rejects a resolved version or the closure contains an Effect 3 runtime or peer-package instance
- THEN the integration owner stops implementation and returns the dependency set to design
- AND no unrelated transitive package is silently upgraded or pinned to force compatibility

### Requirement: IPC and CLI behavior remains compatible

The migration SHALL preserve the existing IPC wire contract and CLI observable behavior.
The migration SHALL preserve current event order, event IDs, existing error-path mapping, command output, and command exit behavior.
For socket close and explicit client close, the migration SHALL settle pending local requests with a deterministic typed `IpcClientError` instead of leaving them pending.

#### Scenario: Existing CLI invocations keep their results

- GIVEN review baseline `main` at `87f47ba99db0acde59f6ed6ebabf085c412faf39` and the migration revision
- WHEN the existing CLI command test invocations run with the same arguments
- THEN command names, help output, argument parsing, default values, results, error text, and exit status match the approved base
- AND all existing assertions in `apps/cli/tests/cli-commands.test.ts`, `events-command.test.ts`, `status-command.test.ts`, and `types-and-query-commands.test.ts` remain enabled and pass
- AND real entrypoint smoke checks cover help, invalid arguments, defaults, errors, output, and exit status
- AND the CLI root preserves live `process.argv` handling while explicit test argv arrays preserve their results

#### Scenario: Daemon entrypoint preserves its CLI contract

- GIVEN the real `apps/daemon` entrypoint
- WHEN help, invalid flags, omitted and explicit socket/database paths, the default ephemeral flag, and startup errors are exercised
- THEN help text, defaults, error output, exit status, and foreground execution match the approved base
- AND signal shutdown follows the daemon host contract

#### Scenario: IPC requests keep their contract

- GIVEN a client connected through the real Unix socket
- WHEN it performs the existing handshake, request, subscription, mutation, and disconnect scenarios
- THEN JSON-RPC framing, method names, capability negotiation, typed error mapping, socket permissions, and cleanup match the [IPC transport specification](../../../../specs/unix-socket-ipc-transport/spec.md)
- AND graph changes continue to use the existing commit path

#### Scenario: A slow consumer loses only its own subscription

- GIVEN the real IPC transport and a client that exceeds the existing slow-consumer drain timeout
- WHEN the server removes the slow consumer under the [IPC transport specification](../../../../specs/unix-socket-ipc-transport/spec.md)
- THEN that subscription terminates and receives no further delivery
- AND unaffected clients continue to receive events
- AND a real-socket drain-timeout test exercises the existing 15-second timeout without production test hooks or instrumentation

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

#### Scenario: Interrupting one pending request preserves the shared client

- GIVEN two requests are pending on one real Unix-socket client
- WHEN the caller interrupts one request before its response
- THEN only that request's correlation ID and callback are removed
- AND the interrupted request settles as interrupted exactly once
- AND a later response for that ID is ignored
- AND the second request succeeds on the same client
- AND the shared socket and subscriptions remain usable

#### Scenario: Interrupting connection setup releases its own socket

- GIVEN IPC client connection setup is pending against a real Unix socket
- WHEN the caller interrupts setup before the client is returned
- THEN the connection attempt closes its socket and removes its owned listeners
- AND it does not resume the callback more than once
- AND it does not affect other clients or listeners

#### Scenario: Peer close or error settles all pending requests

- GIVEN multiple requests are pending on a real Unix-socket client
- WHEN the peer closes the socket cleanly or the socket emits an error
- THEN every pending request settles exactly once with a typed `IpcClientError`
- AND the error matches the existing error-path mapping where one is defined
- AND pending requests and subscriptions are cleared and the socket is released once
- AND another client remains usable

#### Scenario: Explicit client close settles all pending requests

- GIVEN multiple requests and a subscription are active on a real Unix-socket client
- WHEN the caller invokes `client.close()`
- THEN every pending request settles exactly once with a typed `IpcClientError`
- AND subscriptions terminate, receive no further delivery, and are cleared
- AND the socket is released once without affecting another client

#### Scenario: Daemon shutdown handles both supported signals with active clients

- GIVEN a running daemon child process, a real connected client, and a live subscription
- WHEN the test sends `SIGINT` and repeats the same case with `SIGTERM`
- THEN each process exits successfully within the test timeout
- AND the client observes connection closure and the subscription receives no further delivery
- AND active connections and subscriptions are closed
- AND the socket path is removed
- AND the test force-kills any process that exceeds the timeout and reports the timeout as a failure

#### Scenario: Occupied-socket startup failure closes SQLite and preserves the incumbent

- GIVEN an incumbent daemon with a connected client and a temporary SQLite database path for a second daemon
- WHEN the second daemon child opens and loads SQLite, then fails to listen on the incumbent's occupied socket path
- THEN the child exits nonzero within a bounded timeout with the startup failure
- AND the incumbent socket remains present and its client's requests continue to succeed
- AND after the failed child exits, a new daemon can use the same database path with a fresh socket path and answer a client request
- AND the migration extends the existing [second-listener test](../../../../../apps/daemon/tests/host-second-listener.test.ts) to cover this real boundary without a startup test seam
- AND timeout cleanup force-kills the child and reports the timeout as a failure

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
