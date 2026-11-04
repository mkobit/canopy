## Why

Canopy's Unix domain socket IPC server (`@canopy/api-adapter`) streams live `GraphEvent` notifications to subscribed clients over the `canopy.v1.eventStream.event` JSON-RPC 2.0 notification method.
In the `@canopy/graph` kernel, `NodeCreated` and `EdgeCreated` store `properties` as `ReadonlyMap<string, PropertyValue>`, and `NodePropertiesUpdated` and `EdgePropertiesUpdated` store `changes` as `ReadonlyMap<string, PropertyValue>`.
When `createIpcServer` serializes outgoing `canopy.v1.eventStream.event` notifications directly with `JSON.stringify`, JavaScript `Map` instances serialize as empty plain objects (`{}`).
Subscribed IPC clients and `canopy events tail` lose all node and edge property values and property-change deltas at the IPC wire boundary.
In addition, `EventNotificationParamsSchema` currently types the notification `event` payload as `z.record(z.string(), z.unknown())` and `IpcClient.subscribe` types `onEvent` as `(event: unknown) => unknown`, depriving TypeScript consumers and the OpenRPC specification baseline of a strongly typed discriminated union.
This proposal defines a lossless, strongly typed, backward-compatible IPC wire codec and schema contract for [`canopy-4m9`](https://github.com/mkobit/canopy).

## What changes

- Define a wire-level `IpcGraphEventSchema` and `IpcGraphEvent` discriminated union in `@canopy/api-adapter` covering all eight `GraphEvent` variants (`NodeCreated`, `NodePropertiesUpdated`, `NodeDeleted`, `EdgeCreated`, `EdgePropertiesUpdated`, `EdgeDeleted`, `WorkflowStarted`, and `WorkflowCompleted`) with `properties` and `changes` represented as `Readonly<Record<string, PropertyValue>>`.
- Add a pure transport-boundary serializer `serializeGraphEventForIpc(event: GraphEvent): IpcGraphEvent` and round-trip decoder `deserializeIpcGraphEvent(event: unknown): Result<GraphEvent, IpcProtocolError>` in `@canopy/api-adapter`.
- Update `createIpcServer` to serialize each `GraphEvent` once per fan-out dispatch via `serializeGraphEventForIpc` before emitting `canopy.v1.eventStream.event` notifications.
- Tighten `EventNotificationParamsSchema` so `event` is validated against `IpcGraphEventSchema` (with `.passthrough()` preserved for forward compatibility), validate incoming `canopy.v1.eventStream.event` notifications in `IpcClient` via `EventNotificationParamsSchema.safeParse` before invoking subscriber callbacks, and narrow `IpcClient.subscribe`'s `onEvent` callback parameter from `unknown` to `IpcGraphEvent`.
- Regenerate `packages/api-adapter/schema-baselines/ipc-openrpc.json` to document the exact `IpcGraphEvent` discriminated union in the OpenRPC 1.3.2 specification while satisfying all `check:api-compatibility` invariants.

## Capabilities

### New capabilities

None.

### Modified capabilities

- `unix-socket-ipc-transport`: add normative requirements for lossless `GraphEvent` property-map serialization, strongly typed `IpcGraphEvent` notification schemas, and lossless round-trip decoding through `GraphEventSchema`

## Impact

This proposal modifies the `@canopy/api-adapter` Unix socket IPC protocol adapter and its OpenRPC schema baseline (`packages/api-adapter/schema-baselines/ipc-openrpc.json`).
It does not modify `@canopy/graph` kernel types, `EventLogStore` persistence adapters, Connect or GraphQL schemas, or WASM WIT contracts.
Implementation tasks and beads remain gated until this design completes adversarial review and merges with maintainer approval.
