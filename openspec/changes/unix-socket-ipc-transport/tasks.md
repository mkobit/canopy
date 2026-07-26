## 1. Protocol schema and compatibility foundation

- [ ] 1.1 Create `packages/api-adapter/src/ipc/ipc-schema.ts` defining JSON-RPC 2.0 request/response/notification types, error codes, and Zod validators with `.passthrough()` compatibility rules
- [ ] 1.2 Implement method definitions and schemas for `canopy.v1.handshake`, `canopy.v1.query.*`, `canopy.v1.mutation.*`, and `canopy.v1.eventStream.*`
- [ ] 1.3 Implement domain error types (`IpcSocketInUseError`, `IpcProtocolError`) returning `Result<T, E>` per Canopy invariants

## 2. Server-side IPC listener implementation

- [ ] 2.1 Create `packages/api-adapter/src/ipc/ipc-server.ts` implementing `IpcServer` over Node/Bun `node:net`
- [ ] 2.2 Implement umask `0o177` / directory `0o700` isolation and targeted `ECONNREFUSED` stale socket probe/cleanup
- [ ] 2.3 Implement NDJSON line buffering and JSON-RPC method dispatch router in `packages/api-adapter/src/ipc/ipc-handlers.ts`
- [ ] 2.4 Implement event stream subscription dispatch with socket disconnect auto-cleanup and 15-second slow-consumer drain timeout
- [ ] 2.5 Re-export IPC server types and factory in `packages/api-adapter/src/ipc/index.ts` and root `packages/api-adapter/src/index.ts`

## 3. Client-side integration in `apps/cli`

- [ ] 3.1 Create `apps/cli/src/ipc/ipc-client.ts` implementing Effect TS client over `@effect/platform-node` socket streams
- [ ] 3.2 Implement request correlation ID matching (`string | number`), error translation, and event stream queue management in `IpcClient`
- [ ] 3.3 Wire IPC client layer into `apps/cli` command context

## 4. Testing and quality assurance

- [ ] 4.1 Write unit tests for NDJSON framing, JSON-RPC schema parsing, and error code translation in `packages/api-adapter/tests/ipc-schema.test.ts`
- [ ] 4.2 Write integration tests for `IpcServer` socket lifecycle, permissions, stale socket cleanup, query/mutation RPCs, disconnect auto-cleanup, slow-consumer drain timeout, and event stream subscriptions in `packages/api-adapter/tests/ipc-server.test.ts`
- [ ] 4.3 Write forward/backward compatibility test verifying additive fields and unknown key tolerance
- [ ] 4.4 Run full quality gate (`bun run build && bun run lint && bun run typecheck && bun test`)
