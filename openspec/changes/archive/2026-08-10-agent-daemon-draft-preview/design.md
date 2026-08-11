# Design: agent IPC daemon host and DraftSession dry-run

## Context

Canopy's one graph-level agent-access surface is the Unix-socket JSON-RPC server from PR #404 (`packages/api-adapter/src/ipc/ipc-server.ts`).
It is implemented, tested, and complete: NDJSON + JSON-RPC 2.0 framing over `node:net` Unix domain sockets, socket permissions `0o177` / directory `0o700`, stale-socket `ECONNREFUSED` probe cleanup, a 10 MB per-line cap, a 15 s slow-consumer drain timeout, and per-socket subscription cleanup on disconnect.
Its request router (`ipc-handlers.ts`) already dispatches `canopy.v1.handshake`, `canopy.v1.query.*`, `canopy.v1.mutation.*`, and `canopy.v1.eventStream.*` against an `ApiAdapterContext`.

Two gaps block agents from actually using it, both identified in `docs/research/2026-08-03-logseq-db-vs-canopy-architecture.md` (§3):

1. **No host.** `createIpcServer({ socketPath, context })` is never called by a shipped process. `apps/cli` is a client — `daemon status` (`apps/cli/src/commands/status.ts`) and `events` (`events.ts`) both connect to a socket someone else must have opened via `makeIpcClient`; nothing in the repo _becomes_ the server.
2. **No preview.** Agent mutations go straight through `canopy.v1.mutation.*` → `session.commit`. There is no dry-run, even though `DraftSession` (`packages/graph/src/draft-session.ts`) is exactly the primitive Logseq had to bolt on as "pretend mode": an overlay that stages events (`applyEvents`), projects a combined graph without touching the parent, and commits atomically under an optimistic-concurrency check (`commit(expectedParentRevision)`), returning a `DraftError` union that includes `concurrent-modification`.

Relevant current shapes this design builds on:

- `ApiAdapterContext = { graph, session?, eventLogStore?, authContext?, limits? }` (`api-context.ts`). Query handlers already read live via `request.context.session?.graph() ?? request.context.graph`; mutation handlers hard-require `session`. So a host that supplies a loaded `session` gets live reads and a working write path for free.
- `createGraphSession(eventLog, graphId, deviceId)` with `load()` (replays the log into a projection), `commit(events)` (validate → append → project → notify), `graph()`, and `subscribe()`.
- `DraftSession.getParentRevision()` returns `parentGraph.metadata.modified`; `commit()` compares that string to `expectedParentRevision` before delegating to `parentSession.commit(stagedEvents)`.
- The CLI is Effect-TS (`@effect/cli`, `@effect/platform-node`); the daemon command is a plain `Command.make('daemon')` with one subcommand today.

## Goals / non-goals

### Goals

- Stand up the existing IPC server from a dedicated host app so an agent can reach a live graph without hand-wiring, keeping the server out of the `apps/cli` client.
- Expose `DraftSession` over JSON-RPC as an opt-in, two-phase dry-run that mirrors Logseq's preview-then-apply flow, including a machine-readable conflict representation.
- Keep every change additive and reversible: no kernel changes, no new persistence, no protocol version bump.

### Non-goals

- No MCP-protocol adapter in this change (see Decision 3).
- No TCP/remote listening, no multi-user auth server. The trust boundary stays same-user Unix socket.
- No self-daemonization inside the host (double-fork, detach, PID files, auto-restart, log rotation). The host runs in the foreground like `dockerd`.
- **No launch or supervision mechanism.** How the host is started, kept running, or restarted (manual invocation, a supervisor, `systemd`/`launchd`, a local-file/socket-activation scheme) is explicitly out of scope for this change — Mike's direction is to get the process boundary right now and consider access/supervision later.
- No new durability for draft state — drafts are ephemeral by design.

## Decision 1 — a dedicated host app (`apps/daemon`) stands up the server in the foreground

The process that calls `createIpcServer` lives in its **own binary**, `apps/daemon`, not in the `apps/cli` client.
This mirrors the `dockerd` / `docker` split: the daemon _is_ the server; the CLI is a client that talks to an already-running server. Putting host-lifecycle logic in `apps/cli` would be a category error — every existing `apps/cli` command (`daemon status`, `events`, `node`, `query`) is a client operation over `makeIpcClient`, and none _becomes_ a server.

`apps/daemon` is not invoked with a `start` verb a human types; it is the server executable itself. When run, it:

1. Resolves configuration: socket path (default under `XDG_RUNTIME_DIR`, falling back to a user-private directory), event-log database path, and a default `graphId`/`deviceId`.
2. Opens an `EventLogStore` — `createSQLiteEventLog` from `@canopy/storage-sqlite` for a real on-disk vault (the in-memory store is offered only for ephemeral testing).
3. `const session = createGraphSession(eventLog, graphId, deviceId)` then `await session.load()` to rebuild the projection.
4. Builds the context with `createApiAdapterContext({ graph: session.graph(), session, eventLogStore: eventLog })`. Supplying `session` is mandatory so reads resolve live and mutations have a write path — passing only the static `graph` snapshot would serve stale reads.
5. `createIpcServer({ socketPath, context }).listen()`; on `IpcSocketInUseError`, fail fast (one host per socket, enforced by the server's existing probe).

Lifecycle (unchanged from the prior design, just relocated into `apps/daemon`): the server is acquired as a scoped resource (`Effect.acquireRelease`) whose release calls `server.close()` — which already destroys sockets, unbinds subscriptions, and unlinks the socket file. The process stays alive on a never-completing Effect interrupted by `SIGINT`/`SIGTERM`, so shutdown always runs the release. The host never forks or detaches itself; a foreground process is the whole contract, and whatever launches it owns supervision.

`apps/cli` keeps **zero** lifecycle or spawn responsibility for the host. Its existing client-side `daemon status` and `events` commands remain as-is — legitimate client operations against a host that is already running.

Rationale: this is plumbing over a finished server, and the only real decision is the process boundary. A separate foreground binary is the smallest correct thing: it puts server code out of the client package, keeps supervision external (where the platform already solves it), and stays trivially reversible.

Alternatives rejected: (a) a `daemon start` subcommand in `apps/cli` — the layering bug this revision fixes; server-hosting does not belong in the client's command surface. (b) Hosting inside `apps/web`'s browser runtime — impossible, no `node:net`. (c) Self-daemonizing the host with fork/detach + PID file — added failure surface (stale PID, orphan reaping) and it duplicates what `systemd`/`launchd`/a shell already do; out of scope per Mike's direction.

Naming: `apps/daemon` describes what the binary is (the host process), consistent with the repo's no-bucket-names convention. The package name would be `@canopy/daemon` (or an app-scoped equivalent), a sibling of `apps/cli` and `apps/web`.

## Decision 2 — DraftSession surfaces as a connection-scoped `canopy.v1.draft.*` two-phase flow

Add a `draft` method family to `IPC_METHODS` and `ipc-handlers.ts`, backed by a per-connection draft registry that lives in the server exactly like the existing per-socket subscription map (`activeSubscriptions`).

| Method                    | Params                                | Result / behavior                                                                                                                            |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `canopy.v1.draft.create`  | `{}`                                  | Creates `createDraftSession(session)` under a server-generated `draftId`; returns `{ draftId, parentRevision }`.                             |
| `canopy.v1.draft.apply`   | `{ draftId, events }`                 | Calls `applyEvents`; returns `{ staged: <count> }` or a domain error carrying `data.type` on `validation-failure`.                           |
| `canopy.v1.draft.preview` | `{ draftId }`                         | Returns a bounded diff summary: `{ parentRevision, counts: { created, updated, deleted }, touchedNodeIds, touchedEdgeIds }`, capped in size. |
| `canopy.v1.draft.commit`  | `{ draftId, expectedParentRevision }` | Calls `draft.commit(expectedParentRevision)`; success clears the draft; `concurrent-modification` returns a structured domain error.         |
| `canopy.v1.draft.discard` | `{ draftId }`                         | Discards and drops the registry entry.                                                                                                       |

Design choices:

- **Two-phase, not a `dryRun: true` flag on `mutation.*`.** A per-call flag cannot express a staged multi-event batch previewed as a unit, nor the optimistic-concurrency commit `DraftSession` already implements. The draft family subsumes the single-shot preview case (create → apply → preview → commit) while also supporting multi-step wizard-style batches.
- **Conflicts are domain data, not transport errors.** `DraftError` maps to a JSON-RPC error with `code = CANOPY_DOMAIN_ERROR (-32000)` and a `data` payload whose `type` discriminates the union (`concurrent-modification`, `validation-failure`, `storage-error`, …). For `concurrent-modification` the `data` also carries the server's current parent revision so the client can re-fetch, rebase its intended events, re-preview, and retry without reconnecting. This matches how existing handlers already attach `result.error` to `data`.
- **Overlay state stays server-side and connection-scoped.** The registry is keyed `Map<net.Socket, Map<draftId, DraftSession>>`, cleaned up in the same `onCloseOrError` path that already tears down subscriptions. Drafts are never persisted; a dropped connection discards them, which is correct because a dry-run is disposable.
- **Feature detection via handshake.** The handshake `capabilities` array gains `drafts`, so a client learns support without a trial call. Version stays `v1` because everything is additive and all params schemas use `.passthrough()`.

Rationale: reuses `DraftSession` verbatim and the server's existing per-connection resource pattern; the wire contract is small, inspectable with `nc -U`, and forward-compatible.

## Decision 3 — MCP adapter is a separate, later concern

An MCP-protocol adapter does **not** belong in this change.
Reasons:

- MCP is its own protocol surface — a `tools`/`resources` schema, capability negotiation, and (for Logseq) an HTTP/SSE or stdio transport bound to `127.0.0.1` with bearer-token auth — not just another method namespace on the UDS server. It raises a _second_ transport-hosting question this change deliberately scopes out.
- The right primitives to wrap don't exist yet. An MCP `tools/call` for "preview then apply" is a thin mapping over the `canopy.v1.draft.*` flow designed here. Designing the MCP mapping before those preview semantics are built and dogfooded would be speculative.
- Keeping this change to daemon-host + draft-preview keeps it small, reversible, and independently shippable.

Recommendation: file a follow-up bead for an `@canopy/api-adapter` MCP adapter (sibling to `graphql/`, `connect/`, `ipc/`), to be designed once the draft flow is real. Note in that bead that MCP will need its own transport-and-auth decision (HTTP+token vs stdio), separate from the UDS trust model here.

## Adversarial review and mitigations

### Resource and performance overhead

- **Long-lived in-memory projection.** The daemon holds the full projected `Graph` plus incremental merge state for the process lifetime — the same footprint `apps/web` carries, scaling with graph size. Mitigation: one `GraphSession` shared across all connections (never per-connection); document that memory scales with vault size; persisted snapshots / log compaction remain separately tracked deferred work, not required here.
- **Overlay recomputation cost.** `DraftSession.graph()` calls `projectDraftOverlay(parentGraph, stagedEvents)` on every `preview`/read, i.e. O(parent + staged) per call. Many drafts or large staged batches multiply this. Mitigation: cap staged events per draft, cap concurrent drafts per connection and globally, and treat `preview` as the only routine projector so cost is bounded per explicit request rather than per background tick.
- **Unbounded preview payloads.** A diff over a large overlay could serialize a huge response (and the server destroys any line over 10 MB, turning a big preview into a dropped connection). Mitigation: `preview` returns a bounded summary — change counts plus a capped list of touched ids (limit N, with a `truncated` flag) — never the full projected graph; keep responses well under the line cap.
- **Streaming already bounded.** Draft methods are unary, adding no new fan-out; the existing 15 s drain timeout and slow-consumer socket-destroy still govern the subscription path.

### Failure modes and edge cases

- **Non-unique revision token (real correctness risk).** `DraftSession` derives `expectedParentRevision` from `graph.metadata.modified`, a wall-clock value. Two parent commits within the same clock tick can leave `modified` unchanged, so a stale draft commit could pass the equality check it should have failed. This is a pre-existing `DraftSession` property, but the agent surface makes it remotely reachable under concurrency. Mitigation: (a) `session.commit` independently re-runs full structural/referential/type validation (`validateCommit`), so a stale commit can still only add _valid_ data, never corrupt invariants; (b) file a hardening bead to make the revision token a strictly monotonic sequence or content hash rather than a timestamp. Documented as a known limitation for v1, not silently accepted.
- **Crash between append and client ack.** If the daemon dies after `session.commit` appends but before the response is sent, the write is durable (event log is the source of truth) but the ack is lost. Mitigation: at-least-once ack semantics documented; clients use client-supplied node ids and `expectedSequence` for idempotent retries and can re-query to confirm.
- **Stale socket after crash.** Covered by the server's existing `ECONNREFUSED` probe-and-unlink; the host additionally refuses to bind if a live listener answers (`IpcSocketInUseError`).
- **Parent mutated under an open draft.** Handled by design: `commit` returns `concurrent-modification` with the current revision; the draft stays active for re-preview and retry.
- **Connection drops mid-draft.** Staged work is discarded with the connection. Acceptable — a dry-run is disposable; documented so clients don't assume draft durability.
- **Malformed events in `apply`.** `applyDraftEvents` returns an error without partial staging, surfaced as a `validation-failure` domain error; the draft is left unchanged.

### Security and isolation

- **Process boundary does not change the trust model.** Relocating the host from `apps/cli` into a dedicated `apps/daemon` binary is a code-layering fix, not a security-model change: the trust boundary is the Unix socket's filesystem permissions, which are identical wherever the hosting process lives. Moving out of the client package is a mild defense-in-depth improvement — a client CLI invocation can no longer accidentally stand up a server — but the analysis below is unchanged by it.
- **Trust boundary.** The socket lives in a user-private directory (`0o700`) with socket umask `0o177`, so only the owning OS user can connect. That filesystem permission _is_ the entire authN/authZ model: any process running as the user has full read/write to the graph. Mitigation: place the socket under `XDG_RUNTIME_DIR` (tmpfs, per-user, cleared on logout) rather than world-traversable `/tmp`; validate the resolved path; keep the surface UDS-only and explicitly reject TCP so the boundary can't silently widen. Launch/supervision of the host is out of scope for this change, so no launcher-injected trust surface (env, config files, socket activation) is designed here yet — it must be revisited when that mechanism is chosen.
- **Blast radius of a bad agent mutation.** The draft preview is _opt-in_ — a rogue or buggy agent can still call `canopy.v1.mutation.*` directly and commit without previewing. Mitigations, layered: (a) every commit (direct or via draft) re-runs kernel validation, so the worst case is unwanted-but-valid data, not a corrupted graph or deleted system node; (b) the append-only event log means any bad write is fully recoverable and auditable from history — nothing is destroyed, only shadowed (the recoverability property called out in the research doc §6); (c) design the `authContext.scopes` hook now so a future handshake can pin a connection to read-only or draft-only, enforced when least-privilege agent access is actually needed. v1 ships same-user full trust, documented plainly.
- **Preview state as a DoS vector.** Unbounded `draft.create` / `draft.apply` lets a single client exhaust daemon memory/CPU via overlay projections. Because the trust boundary is same-user, this is self-DoS rather than cross-tenant, which lowers severity but not to zero (a runaway agent can OOM the daemon). Mitigation: hard caps on concurrent drafts (per connection and global), staged events per draft, and preview result size; idle-TTL eviction of abandoned drafts; connection-scoped cleanup already frees state on disconnect.
- **Validation cannot be bypassed via drafts.** Preview uses the kernel overlay projection and `commit` always delegates to `session.commit`, so a draft can never write data that a direct mutation couldn't — drafts reduce risk, never add a bypass.

### Migration and backward compatibility

- **Purely additive protocol.** New `canopy.v1.draft.*` methods and a new `apps/daemon` host binary; no existing method, schema, or CLI command changes, and `apps/cli` is untouched. All param schemas remain `.passthrough()`. An old client ignores the new methods; a new client calling drafts against an old server gets `METHOD_NOT_FOUND` and can instead feature-detect via the handshake `drafts` capability. No protocol version bump — stays `v1`.
- **No data migration.** The host opens an existing `EventLogStore` and replays it; no schema or on-disk format change.
- **Live-read invariant.** Handlers prefer `session.graph()` over the static `context.graph`; the host must construct the context with a _loaded_ session or reads go stale. Captured as an explicit host requirement, not left implicit.
- **Reversibility.** Both additions can be removed without touching `@canopy/graph`; `DraftSession` is consumed as-is. Low lock-in, consistent with keeping the agent surface small while the domain model grows.
