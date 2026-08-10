## 1. Scaffold `apps/daemon` (`@canopy/daemon`)

- [x] 1.1 Create `apps/daemon/package.json` mirroring `apps/cli/package.json`: `"name": "@canopy/daemon"`, `"private": true`, `"type": "module"`, a `bin` entry (e.g. `"canopy-daemon": "./dist/index.js"`), and `scripts` (`build`: `tsc -b tsconfig.build.json`, `dev`: `bun run src/index.ts`, `test`: `bun test ./src ./tests`, `typecheck`: `tsc -p tsconfig.json`). Depend on `@canopy/api-adapter`, `@canopy/graph`, `@canopy/storage-sqlite`, and the `effect` / `@effect/platform-node` packages at the same versions `apps/cli` pins; devDependency `typescript`.
- [x] 1.2 Create `apps/daemon/tsconfig.build.json` and `apps/daemon/tsconfig.json` mirroring `apps/cli`'s pair (extend `../../tsconfig.base.json`, `bundler` resolution, `noEmit`, `bun-types`; `references` to `packages/graph`, `packages/api-adapter`, `packages/storage-sqlite` build tsconfigs; `paths` for those `@canopy/*` entries so Bun/tsc resolve source). Confirm the root `apps/*` workspace glob and root `tsc -b && bun --filter './apps/*' build` pick the app up with no root changes.
- [x] 1.3 Create `apps/daemon/AGENTS.md` stating the package scope: "the foreground host process that stands up the `@canopy/api-adapter` IPC server; it is the server (dockerd-style), not a client; it does not self-daemonize and owns no launch/supervision logic."
- [x] 1.4 Run `bun install` and confirm `bun pm ls --all` shows `@canopy/daemon` with the intended dependency edges and no `yjs`/`y-protocols` (invariant 2).

## 2. Host boot sequence (`apps/daemon/src`)

- [x] 2.1 Add `src/config.ts` resolving: socket path (default under `XDG_RUNTIME_DIR`, falling back to a user-private directory; validate the resolved path), event-log database path, and default `graphId`/`deviceId` (via `asGraphId`/`asDeviceId`). Return a `Result`/typed config, no thrown errors (invariant 8).
- [x] 2.2 Add `src/host.ts` `startHost(config)` that: opens a `createSQLiteEventLog(...)` from `@canopy/storage-sqlite`; `const session = createGraphSession(eventLog, graphId, deviceId)`; `await session.load()`; builds `createApiAdapterContext({ graph: session.graph(), session, eventLogStore: eventLog })` (session is mandatory so reads resolve live and mutations have a write path); calls `createIpcServer({ socketPath, context }).listen()`; on `IpcSocketInUseError` fails fast without binding a second listener.
- [x] 2.3 Support an ephemeral mode (flag/env) that swaps `createSQLiteEventLog` for the in-memory `EventLogStore` from `@canopy/storage`, for tests only.

## 3. Host lifecycle and entrypoint

- [x] 3.1 Add `src/index.ts` that runs `startHost` inside a scoped Effect: acquire the listening server with `Effect.acquireRelease`, whose release calls `server.close()` (destroys sockets, unbinds subscriptions, unlinks socket file).
- [x] 3.2 Keep the process alive on a never-completing Effect and wire `SIGINT`/`SIGTERM` to interrupt the scope so the release always runs; exit non-zero if `listen()` returns `err`. Do NOT fork, detach, write a PID file, or otherwise self-daemonize.
- [x] 3.3 Confirm no launch/supervision mechanism is introduced (no systemd unit, no launchd plist, no socket-activation code) — out of scope for this change.

## 4. Draft JSON-RPC schemas (`packages/api-adapter/src/ipc/ipc-schema.ts`)

- [x] 4.1 Add `canopy.v1.draft.create|apply|preview|commit|discard` entries to `IPC_METHODS`.
- [x] 4.2 Add `.passthrough()` Zod param/result schemas: `DraftCreateResult` `{ draftId, parentRevision }`; `DraftApplyParams` `{ draftId, events }` (events validated as `GraphEvent[]`) and result `{ staged }`; `DraftPreviewParams` `{ draftId }` and `DraftPreviewResult` `{ parentRevision, counts: { created, updated, deleted }, touchedNodeIds, touchedEdgeIds, truncated }`; `DraftCommitParams` `{ draftId, expectedParentRevision }`; `DraftDiscardParams` `{ draftId }`. Export types via `z.infer`.
- [x] 4.3 Add `drafts` to the handshake `capabilities` the server advertises (`HandshakeResult` in `ipc-handlers.ts` currently returns `['queries','mutations','subscriptions']`).

## 5. Draft handlers and server-side registry

- [x] 5.1 In `ipc-server.ts`, add a per-connection draft registry alongside `activeSubscriptions` (e.g. `Map<net.Socket, Map<draftId, DraftSession>>`); create/lookup/delete entries as the handler results direct, mirroring the existing `newSubscription`/`unsubscribeId` plumbing rather than reaching into module state.
- [x] 5.2 Extend `IpcHandlerResponse` (`ipc-handlers.ts`) with the draft lifecycle signals the server needs (new draft to register, draft id to drop) so `ipc-server.ts` owns the socket-keyed map and `ipc-handlers.ts` stays pure.
- [x] 5.3 Implement the five `canopy.v1.draft.*` cases in `handleIpcRequestLine`: `create` → `createDraftSession(context.session)` under a server-generated `draftId`, return `{ draftId, parentRevision }`; `apply` → `applyEvents`; `preview` → bounded diff (see 5.4); `commit` → `draft.commit(expectedParentRevision)` then drop the draft on success; `discard` → drop the draft.
- [x] 5.4 Compute `preview` as a bounded summary from the overlay-vs-parent projection: change counts plus capped `touchedNodeIds`/`touchedEdgeIds` lists (limit N, set `truncated`); never serialize the full projected graph and keep responses well under the 10 MB line cap.
- [x] 5.5 Map `DraftError` to a JSON-RPC error with `code = CANOPY_DOMAIN_ERROR` and `data.type` discriminant; for `concurrent-modification` include the server's current parent revision so the client can re-fetch, rebase, re-preview, and retry.
- [x] 5.6 Enforce and reject-past bounded limits: max concurrent drafts per connection and global, max staged events per draft, max preview result size; add idle-TTL eviction of abandoned drafts.
- [x] 5.7 On socket `close`/`error`, discard that connection's drafts in the existing `onCloseOrError`/`cleanupSocketSubscriptions` path so no draft state outlives its connection.
- [x] 5.8 Reject any `canopy.v1.draft.*` request when `context.session` is absent (read-only context) with a clear domain error, consistent with how mutation handlers require a session.

## 6. Protocol discoverability

- [x] 6.1 Add the five draft methods (params/result schemas, error codes) to `ipc-openrpc-spec.ts` so the generated OpenRPC document stays in sync; update any snapshot test asserting the method list.

## 7. Host tests (`apps/daemon/tests`)

- [x] 7.1 Boot test: start the host in ephemeral mode on a temp socket path, connect a raw NDJSON socket (mirror `packages/api-adapter/tests/ipc-server-streaming.load.test.ts`), send `canopy.v1.handshake`, assert success and that `capabilities` includes `drafts`.
- [x] 7.2 Second-listener test: starting a second host on the same socket path fails with `IpcSocketInUseError` and does not bind.
- [x] 7.3 Shutdown test: on `SIGINT`/scope interrupt (or a direct release), the server closes, active connections are destroyed, and the socket file is unlinked.
- [x] 7.4 Live-read test: a mutation committed through the socket is visible to a subsequent query on the same host (confirms the context uses a loaded live `session`, not a stale snapshot).

## 8. Draft flow tests (`packages/api-adapter/tests`)

- [x] 8.1 Happy path: `draft.create` → `draft.apply` (valid events) → `draft.preview` returns non-zero counts and touched ids while the parent graph is unchanged → `draft.commit` with the matching `parentRevision` succeeds and the change is now visible via a normal query.
- [x] 8.2 Concurrent-modification + re-preview: create a draft, mutate the parent out-of-band so its revision advances, `draft.commit` returns `CANOPY_DOMAIN_ERROR` with `data.type = "concurrent-modification"` and the current revision, the draft stays active, and a re-`preview`-then-`commit` at the new revision succeeds.
- [x] 8.3 Validation-failure: `draft.apply` with invalid events returns a `data.type = "validation-failure"` domain error and leaves the draft unchanged.
- [x] 8.4 Bounded preview: a large staged batch yields a preview whose touched-id lists are capped with `truncated = true` and whose serialized response stays under the line cap.
- [x] 8.5 Cleanup on disconnect: after `draft.create`/`apply`, dropping the connection frees the draft (assert via `getActiveConnectionCount`/no leaked state); a later request on a fresh connection cannot reach the old `draftId`.
- [x] 8.6 Limits: exceeding the concurrent-draft cap (and staged-events cap) returns a domain error rather than growing state unbounded.
- [x] 8.7 Missing-session: draft methods against a read-only context (no `session`) return the expected domain error.

## 9. Quality gates

- [x] 9.1 `bun run build` then `bun run lint`, `bun run typecheck`, `bun test` all green (build before lint per repo CI ordering).
- [x] 9.2 `bunx openspec validate agent-daemon-draft-preview --strict` passes.
- [x] 9.3 Confirm `apps/cli` is untouched (no `daemon start`, no host/spawn logic added) and `docs/architecture/bounded-contexts.md` notes the new `apps/daemon` host if that doc enumerates apps.
