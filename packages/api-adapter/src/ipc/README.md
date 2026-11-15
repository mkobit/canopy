# JSON-RPC 2.0 IPC transport

## Overview

This directory defines the JSON-RPC 2.0 IPC wire schemas, deterministic OpenRPC 1.3.2 specification generation, stateless request dispatch (`ipc-handlers.ts`), Unix domain socket `net.Server` lifecycle (`ipc-server.ts`), and Effect-based Unix socket client (`ipc-client.ts`).

## Interface

- `[index.ts:*]` Barrel re-exports from `./ipc-client`, `./ipc-handlers`, `./ipc-openrpc-spec`, `./ipc-schema`, and `./ipc-server`.
- `[ipc-schema.ts:IPC_METHODS]`, `[ipc-schema.ts:JSON_RPC_ERROR_CODES]`, `[ipc-schema.ts:IpcSocketInUseError]`, `[ipc-schema.ts:IpcProtocolError]`, `[ipc-schema.ts:IpcResult]`, `[ipc-schema.ts:IpcPropertyMapSchema]`, `[ipc-schema.ts:IpcGraphEventSchema]`, `[ipc-schema.ts:serializeGraphEventForIpc]`, `[ipc-schema.ts:deserializeIpcGraphEvent]` 19 versioned `canopy.v1.*` method constants, Zod envelope/method schemas, and wire event serializers.
- `[ipc-openrpc-spec.ts:JSON_RPC_IPC_SPECIFICATION]` Deterministic, key-sorted JSON string of the OpenRPC 1.3.2 specification.
- `[ipc-handlers.ts:DraftRegistryEntry]`, `[ipc-handlers.ts:IpcHandlerResponse]`, `[ipc-handlers.ts:handleIpcRequestLine]` Stateless JSON-RPC 2.0 request parser and dispatcher.
- `[ipc-server.ts:IpcServerOptions]`, `[ipc-server.ts:IpcServer]`, `[ipc-server.ts:createIpcServer]` Unix domain socket NDJSON server with connection-scoped subscription and draft registries.
- `[ipc-client.ts:IpcClientError]`, `[ipc-client.ts:IpcClient]`, `[ipc-client.ts:makeIpcClient]` Effect constructor `(socketPath: string) => Effect<IpcClient, IpcClientError>`.

## Invariants

- `[ipc-schema.ts:JsonRpcRequestSchema]` All JSON-RPC envelope and method param/result schemas use `.passthrough()`; `[ipc-schema.ts:IpcPropertyMapSchema]` escapes `'__proto__'` and `/^__canopy_proto___*$/` sentinel keys around `z.record`.
- `[ipc-openrpc-spec.ts:sortKeysRecursively]` Recursively sorts all object keys lexicographically before `JSON.stringify`.
- `[ipc-handlers.ts:handleIpcRequestLine]` Enforces `MAX_DRAFTS_PER_CONNECTION` (10), `MAX_DRAFTS_GLOBAL` (100), `MAX_STAGED_EVENTS_PER_DRAFT` (500), `MAX_PREVIEW_TOUCHED_IDS` (200), and `DRAFT_IDLE_TTL_MS` (600000 ms); requires `context.session` for `DRAFT_*` methods; reads `drafts` `ReadonlyMap` without mutating it, emitting `newDraft`, `dropDraftIds`, and `touchDraft` signals.
- `[ipc-server.ts:MAX_LINE_BYTES]` Destroys sockets when buffered NDJSON exceeds `10485760` bytes (10 MiB) or backpressured writes fail to drain within `15000` ms; `ipc-server.ts` is the sole writer to `activeDraftRegistries` and `activeSubscriptions`.
- `[ipc-client.ts:terminate]` Idempotent cleanup settles all pending requests with error, clears maps, and rejects subsequent `request()` calls; incoming `EVENT_STREAM_EVENT` notifications are validated with `EventNotificationParamsSchema.safeParse`.

## Side Effects

- `[ipc-handlers.ts:handleIpcRequestLine]` Executes `@canopy/graph-access` queries, mutations, subscriber creation, and draft operations.
- `[ipc-server.ts:createIpcServer]` Creates parent directory (`0o700`), probes/unlinks stale sockets, temporarily sets `process.umask(0o177)` around `server.listen(socketPath)`, manages `net.Socket` listeners and 15000 ms drain timers, and unlinks `socketPath` on close.
- `[ipc-client.ts:makeIpcClient]` Opens a Unix socket via `net.connect(socketPath)`, writes NDJSON lines, mutates local ref state, and invokes subscription `onEvent` callbacks.

## Verification

- Run: `bun test`
