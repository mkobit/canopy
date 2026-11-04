## MODIFIED Requirements

### Requirement: Unix domain socket IPC transport server

The `@canopy/api-adapter` package SHALL provide an `IpcServer` over Unix domain sockets with socket permissions `0o177` / directory `0o700` and JSON-RPC 2.0 NDJSON message framing.
The `canopy.v1.handshake` result SHALL advertise a `drafts` capability when the server supports the `canopy.v1.draft.*` method family, so clients can feature-detect the preview surface without probing individual methods.
When `IpcServer` emits `canopy.v1.eventStream.event` notifications, it SHALL serialize `GraphEvent` instances through a transport-boundary wire codec (`serializeGraphEventForIpc`) that converts `ReadonlyMap<string, PropertyValue>` fields (`NodeCreated.properties`, `EdgeCreated.properties`, `NodePropertiesUpdated.changes`, and `EdgePropertiesUpdated.changes`) into plain JSON objects (`Readonly<Record<string, PropertyValue>>`) without dropping entries.
The `@canopy/api-adapter` package SHALL validate `canopy.v1.eventStream.event` notification payloads against a discriminated union schema (`IpcGraphEventSchema`) covering all eight `GraphEvent` variants and SHALL provide a lossless round-trip decoder (`deserializeIpcGraphEvent`) that reconstructs canonical `@canopy/graph` `GraphEvent` values via `GraphEventSchema`.

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

#### Scenario: Node and edge property maps are preserved across IPC event notifications

- **WHEN** a subscribed IPC client receives `canopy.v1.eventStream.event` notifications for `NodeCreated`, `NodePropertiesUpdated`, `EdgeCreated`, or `EdgePropertiesUpdated` events containing non-empty `ReadonlyMap<string, PropertyValue>` fields
- **THEN** the received `IpcGraphEvent` payload SHALL contain all property keys and `PropertyValue` entries (`string`, `number`, `boolean`, `null`, `ExternalReference`, and arrays thereof) as a plain JSON object
- **AND** decoding the received `IpcGraphEvent` with `deserializeIpcGraphEvent` (or `GraphEventSchema.safeParse`) SHALL produce a `GraphEvent` whose `ReadonlyMap` contents equal the original domain event's map entries.

#### Scenario: All GraphEvent variants validate against IpcGraphEventSchema and OpenRPC baseline

- **WHEN** any of the eight `GraphEvent` variants (`NodeCreated`, `NodePropertiesUpdated`, `NodeDeleted`, `EdgeCreated`, `EdgePropertiesUpdated`, `EdgeDeleted`, `WorkflowStarted`, `WorkflowCompleted`) is serialized with `serializeGraphEventForIpc`
- **THEN** the serialized payload SHALL pass `IpcGraphEventSchema.safeParse` and `EventNotificationParamsSchema.safeParse`
- **AND** the exported `JSON_RPC_IPC_SPECIFICATION` OpenRPC document SHALL include the discriminated union schema for `canopy.v1.eventStream.event` and pass `check:api-compatibility`.
