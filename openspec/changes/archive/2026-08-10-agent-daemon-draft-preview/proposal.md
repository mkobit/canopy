## Why

Comparative research against Logseq DB (`docs/research/2026-08-03-logseq-db-vs-canopy-architecture.md`, `canopy-aj2`) surfaced two concrete gaps in Canopy's agent-facing IPC surface.

1. The Unix-socket JSON-RPC server is implemented and tested (`packages/api-adapter/src/ipc/ipc-server.ts`) but nothing hosts it.
   `apps/cli` is a client — its `daemon status` and `events` commands connect to a socket someone else must have opened — and no shipped process calls `createIpcServer`, so an agent can reach the live graph only if something stands up the socket by hand.
2. Agent-issued mutations have no preview step.
   Logseq's official MCP server ships a dry-run "pretend" mode that previews AI edits before applying them; Canopy already has the matching primitive — `DraftSession` (`packages/graph/src/draft-session.ts`), an optimistic-concurrency overlay built for plugin wizards — but it is not exposed over the IPC/agent surface.

Both are plumbing over primitives that already exist, not new subsystems.
This change designs a dedicated host app that stands up the server, how `DraftSession` previews surface over JSON-RPC, and decides whether an MCP-protocol adapter belongs in this change (it does not).

## What changes

- Add a new host binary `apps/daemon` that opens an `EventLogStore`, creates and loads a `GraphSession`, builds an `ApiAdapterContext`, and hosts `createIpcServer` in the foreground for the process lifetime with graceful shutdown. It is the server process (`dockerd`-style), separate from the `apps/cli` client (`docker`-style).
- Add a `canopy.v1.draft.*` JSON-RPC method family to `@canopy/api-adapter` that exposes `DraftSession` as a connection-scoped, two-phase preview/commit flow (`create`, `apply`, `preview`, `commit`, `discard`).
- Represent `DraftError` conflicts (notably `concurrent-modification`) as structured JSON-RPC domain errors so a remote client can branch and re-preview.
- Advertise a `drafts` capability in the existing `canopy.v1.handshake` so clients can feature-detect the preview surface.
- Explicitly defer an MCP-protocol adapter to a separate follow-up bead; the `draft.*` methods designed here are the primitives such an adapter would wrap.

## Capabilities

### New capabilities

- `agent-daemon-host`: a dedicated `apps/daemon` host process hosts the `@canopy/api-adapter` IPC server with a loaded session and graceful lifecycle; launch and supervision of that process are out of scope.
- `agent-draft-preview`: `@canopy/api-adapter` exposes `DraftSession` over JSON-RPC as a connection-scoped, two-phase dry-run/commit flow for agent-issued mutations.

### Modified capabilities

- `unix-socket-ipc-transport`: the handshake advertises a `drafts` capability and the method set gains the `canopy.v1.draft.*` family.

## Impact

- `apps/daemon` (new): the host binary that opens an `EventLogStore`, loads a `GraphSession`, builds the context, and hosts `createIpcServer` with scoped/`SIGINT`/`SIGTERM` shutdown. It does not self-daemonize; how it is launched or supervised is out of scope.
- `apps/cli`: unchanged. It keeps zero lifecycle responsibility for the host; its existing client-side `daemon status` and `events` commands run against an already-running host.
- `@canopy/api-adapter`: new `draft.*` schemas/handlers in `src/ipc/`; a server-side per-connection draft registry; no change to existing query/mutation/event methods.
- `@canopy/graph`: no code change required — `DraftSession` is consumed as-is; a hardening note on the parent-revision token is raised for a separate bead.
- No storage or schema migration: the host opens an existing event log; all additions are backward-compatible.
