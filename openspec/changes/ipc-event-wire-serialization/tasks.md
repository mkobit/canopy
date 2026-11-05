# IPC event wire serialization implementation plan

**Goal:** Preserve graph property maps (`NodeCreated.properties`, `EdgeCreated.properties`, `NodePropertiesUpdated.changes`, `EdgePropertiesUpdated.changes`) across the Unix domain socket IPC event notification boundary (`canopy.v1.eventStream.event`), validate incoming IPC event notifications against `IpcGraphEventSchema`, narrow `IpcClient.subscribe` to `IpcGraphEvent`, provide lossless round-trip decoding via `deserializeIpcGraphEvent`, and update the OpenRPC schema baseline.

**Spec:** [Approved design](design.md) and [Unix socket IPC transport specification](specs/unix-socket-ipc-transport/spec.md).
Approval: [PR #600](https://github.com/mkobit/canopy/pull/600), merged at `dd6124a8e5bf8a4bec38ebfb66c8559ada235e3b`.
Bead: `canopy-4m9`.

## Task 1: Define wire-level IPC event schemas and round-trip codec

**Files:**
- `packages/api-adapter/src/ipc/ipc-schema.ts`
- `packages/api-adapter/src/ipc/index.ts`
- `packages/api-adapter/src/index.ts`
- `packages/api-adapter/tests/ipc-schema.test.ts`

- [x] Define `IpcPropertyMapSchema` and the eight-variant `IpcGraphEventSchema` discriminated union (`NodeCreated`, `NodePropertiesUpdated`, `NodeDeleted`, `EdgeCreated`, `EdgePropertiesUpdated`, `EdgeDeleted`, `WorkflowStarted`, `WorkflowCompleted`) with `.passthrough()` and readonly `IpcGraphEvent` type in `packages/api-adapter/src/ipc/ipc-schema.ts`.
- [x] Update `EventNotificationParamsSchema` so `event` validates against `IpcGraphEventSchema`.
- [x] Implement and export `serializeGraphEventForIpc(event: GraphEvent): IpcGraphEvent` using prototype-safe `Object.defineProperty` property-map conversion and omitting `undefined` optional fields (`batchId`, `migrationId`).
- [x] Implement and export `deserializeIpcGraphEvent(event: unknown): Result<GraphEvent, IpcProtocolError>` via `GraphEventSchema.safeParse`.
- [x] Add unit tests in `packages/api-adapter/tests/ipc-schema.test.ts` covering all eight `GraphEvent` variants, optional `batchId` and `migrationId` fields, falsy scalars (`false`, `0`, `""`, `null`), `ExternalReference`, arrays, `"__proto__"` and `"constructor"` keys, unknown additive properties via `.passthrough()`, and invalid event rejection.

## Task 2: Wire IPC server outbound serialization, client validation, and OpenRPC baseline

**Files:**
- `packages/api-adapter/src/ipc/ipc-server.ts`
- `packages/api-adapter/src/ipc/ipc-client.ts`
- `packages/api-adapter/schema-baselines/ipc-openrpc.json`
- `packages/api-adapter/tests/ipc-server.test.ts`
- `packages/api-adapter/tests/ipc-client.test.ts`

- [x] Update `createIpcServer` in `packages/api-adapter/src/ipc/ipc-server.ts` to serialize outgoing `canopy.v1.eventStream.event` notifications via `serializeGraphEventForIpc`.
- [x] Update `makeIpcClient` in `packages/api-adapter/src/ipc/ipc-client.ts` to validate incoming `canopy.v1.eventStream.event` notifications with `EventNotificationParamsSchema.safeParse` and narrow `IpcClient.subscribe` to `onEvent?: (event: IpcGraphEvent) => unknown`.
- [x] Add real Unix domain socket regression and round-trip tests in `packages/api-adapter/tests/ipc-server.test.ts` and `packages/api-adapter/tests/ipc-client.test.ts` covering `NodeCreated`, `NodePropertiesUpdated`, `EdgeCreated`, `EdgePropertiesUpdated`, `NodeDeleted`, `EdgeDeleted`, `WorkflowStarted`, and `WorkflowCompleted` with non-empty property maps, falsy scalars, `ExternalReference`, arrays, optional `batchId`/`migrationId`, and `"__proto__"` keys.
- [x] Regenerate `packages/api-adapter/schema-baselines/ipc-openrpc.json` via `bun tools/check-api-compatibility.ts --target=ipc --update-baselines`.

## Task 3: Verification, review, and publication

- [ ] Run `bun run build`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun tools/check-api-compatibility.ts`, `bunx openspec validate --all --strict`, and `bd lint canopy-4m9`.
- [ ] Run independent review via a read-only research subagent against the approved design and spec scenarios.
- [ ] Open and merge the pull request, and close `canopy-4m9`.
