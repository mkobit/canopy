# native-messaging-bridge Specification

## Purpose
TBD - created by archiving change browser-extension-web-clipper. Update Purpose after archive.
## Requirements
### Requirement: Native-messaging host bridges the extension to the daemon Unix socket

The system SHALL provide a native-messaging host process that the browser launches over its native-messaging stdio protocol and that relays requests to the daemon's existing Unix-socket JSON-RPC surface via the `@canopy/api-adapter` `IpcClient`.
The host SHALL NOT open any TCP or network-listening socket and SHALL NOT require the daemon to expose any new transport.

#### Scenario: Extension request reaches the daemon and a response returns

- **WHEN** the extension sends a native-message request for an allowlisted method and the daemon is running
- **THEN** the host SHALL relay it to the daemon over the existing Unix domain socket and return the daemon's JSON-RPC response to the extension

#### Scenario: No network transport is introduced

- **WHEN** the host runs
- **THEN** it SHALL communicate with the browser only over native-messaging stdio and with the daemon only over the Unix domain socket, and SHALL bind no network port

### Requirement: The host is a narrowing proxy restricted to a clip method allowlist

The host SHALL relay only an allowlisted set of methods — `canopy.v1.handshake`, the `canopy.v1.draft.*` family, `canopy.v1.mutation.createNode` restricted to the `clip` namespace, and the read/query methods needed to ensure the `WebClip` type — and SHALL reject any other method (including the broader `canopy.v1.mutation.*` surface) with a clear error, without forwarding it to the daemon.

#### Scenario: Out-of-allowlist method is rejected at the host

- **WHEN** the extension requests a method outside the allowlist (for example a delete or an arbitrary mutation)
- **THEN** the host SHALL reject the request locally and SHALL NOT forward it to the daemon

#### Scenario: createNode is constrained to the clip namespace

- **WHEN** the extension requests `canopy.v1.mutation.createNode` (directly or as a staged draft event) for a node outside the `clip` namespace
- **THEN** the host SHALL reject the request

### Requirement: The host binds a single blessed extension and rate-limits requests

The native-messaging host manifest SHALL restrict the connecting client to the blessed extension identity via `allowed_origins`/`allowed_extensions`, and the host SHALL apply a request rate limit so a compromised or runaway extension cannot flood the daemon.

#### Scenario: Only the blessed extension can connect

- **WHEN** a browser extension whose identity is not in the host manifest allowlist attempts to launch the host
- **THEN** the browser SHALL refuse to start the native-messaging connection

#### Scenario: Excess request rate is throttled

- **WHEN** the extension exceeds the host's configured request rate
- **THEN** the host SHALL reject or throttle the excess requests rather than forwarding them unbounded to the daemon

### Requirement: The host degrades clearly when the daemon is unavailable

The host SHALL surface a clear, typed error to the extension when the daemon Unix socket is absent or refuses connection, and SHALL NOT crash the browser's native-messaging port on a transient daemon failure.

#### Scenario: Daemon not running

- **WHEN** the extension issues a request but no daemon is listening on the resolved socket path
- **THEN** the host SHALL return a clear "daemon unavailable" error the extension can present to the user, without losing the user's captured clip payload

