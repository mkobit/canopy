# Design: browser extension web clipper

## Context

Canopy's only graph-write surface reachable outside `apps/web` is the Unix-domain-socket JSON-RPC server in `@canopy/api-adapter` (`packages/api-adapter/src/ipc/ipc-server.ts`), now hosted by `apps/daemon` (epic `canopy-h7z`, archived at `openspec/changes/archive/2026-08-10-agent-daemon-draft-preview/`).
Its trust model is deliberately narrow: same-user only, socket permissions `0o177` / directory `0o700`, no TCP, no remote listening — the daemon design's security section says explicitly "keep the surface UDS-only and explicitly reject TCP so the boundary can't silently widen" and punts broader access questions.
Write paths on that surface today are `canopy.v1.mutation.createNode` and the two-phase `canopy.v1.draft.*` preview/commit flow backed by `DraftSession`.

A web clipper is a fundamentally different client from `apps/cli`:

- It runs inside a browser sandbox. Browser extension APIs do not expose raw Unix-domain-socket (or arbitrary local socket) access, so the extension **cannot** connect to the daemon directly.
- Its code is remotely updatable (web-store auto-update) and its content script executes in the context of arbitrary, untrusted web pages. It is not a same-OS-user process the daemon can trust the way it trusts a local CLI invocation.

There is **no existing HTTP/WebSocket surface** to reuse. The `connect/` and `graphql/` adapters in `@canopy/api-adapter` are transport-agnostic — they build service descriptors and schema/SDL but nothing in the repo binds them to a listening HTTP server. `apps/web` uses Vite only to serve the SPA and runs the kernel in-browser (no `node:net`). So the only running server is the UDS one, and the only question is how a browser reaches it.

Two decisions carry this change: the transport/trust bridge (Decision 1) and the node/type shape of a clip (Decision 2). Everything else is conventional extension plumbing.

## Goals / Non-Goals

**Goals:**

- Capture the current page or a user selection from the browser and land it in the Canopy graph as a node with `title`, `sourceUrl`, `content`, and `capturedAt`, matching the shape of Obsidian's web clipper.
- Cross the browser-to-daemon trust boundary without widening the daemon's deliberately-narrow UDS-only, same-user model.
- Reuse existing primitives: the `canopy.v1.draft.*` preview/commit flow, the `IpcClient`, and the dynamic type-authoring control plane. No kernel change, no new daemon transport.
- Keep the extension a capture-and-confirm client only — every clip is user-initiated and user-confirmed before it is written.

**Non-Goals:**

- **Context enrichment** — using clipped or browsing content to enrich other graph nodes (auto-suggest links, backfill properties). Named in epic `canopy-2nn` as a future idea; not designed here.
- **WebMCP** — exposing or consuming an MCP surface from the browser context. Ties to `canopy-k35` (MCP adapter, itself deferred). Not designed here.
- No daemon launch/supervision mechanism (unchanged from the daemon design — how the daemon starts is still out of scope).
- No new daemon transport (no localhost HTTP/WS/TCP), no multi-user auth server.
- No offline/queued sync of clips beyond a best-effort retry on transient daemon-unavailable; durable offline capture is a follow-up if dogfooding shows it is needed.
- No Firefox/Safari packaging specifics beyond keeping the extension MV3-portable; the first target is a Chromium MV3 build.

## Decision 1 — a native-messaging host bridges the extension to the existing UDS; the daemon grows no new transport

The extension talks to a small same-user **native-messaging host** (`apps/clip-host`) over the browser's native-messaging stdio protocol; that host relays to the daemon's existing Unix socket using the same `IpcClient` logic `apps/cli` already has.
This is exactly how password managers and other browser-to-local-app integrations cross the same boundary: the browser launches a registered native host binary and exchanges length-prefixed JSON over its stdio; the host is an ordinary same-user process that can do same-user things — including opening the daemon's UDS.

**A necessary prerequisite, confirmed against the code, not assumed:** `IpcClient` lives today at `apps/cli/src/ipc/ipc-client.ts` — a private module inside `apps/cli`, not exported by `@canopy/api-adapter`. `apps/clip-host` cannot legitimately depend on it there: `apps/cli` declares no exports for other packages to consume, and reaching into another package's `src/` is exactly the "cross-package shortcut" this repo's architectural rules forbid (`docs/architecture/bounded-contexts.md`: "A package may only import from the packages listed in its `package.json` `dependencies` ... Cross-package shortcuts (deep imports into another package's `src/`) are forbidden"). This change therefore includes relocating `IpcClient` into `@canopy/api-adapter/src/ipc/ipc-client.ts` — a natural sibling to `ipc-server.ts` in the same directory, both implementing the same wire protocol — and exporting it from that package's public `index.ts`. `apps/cli` switches its one import to `@canopy/api-adapter`'s new export (an import-path change only; `apps/cli/src/ipc/ipc-client.ts`'s existing test, `apps/cli/tests/ipc-client.test.ts`, moves or is re-pointed with no behavior change). `apps/clip-host` then imports the same export as a real `@canopy/api-adapter` dependency, no deep import required.

The host is a **narrowing** proxy, not a transparent one. It relays only an allowlist: `canopy.v1.handshake`, the `canopy.v1.draft.*` family, `canopy.v1.mutation.createNode` constrained to the `clip` namespace, and the read/query calls needed to ensure the `WebClip` type exists. Anything else — including the broader `canopy.v1.mutation.*` surface (deletes, arbitrary-namespace writes) — is rejected at the host without reaching the daemon. The host's native-messaging manifest pins `allowed_origins`/`allowed_extensions` to the blessed extension ID, and the host rate-limits requests.

Why this over the alternatives:

- **(Rejected) A new localhost HTTP/WebSocket listener in the daemon with its own auth.** This is the option the daemon design explicitly warned against ("explicitly reject TCP so the boundary can't silently widen"). A network port — even `127.0.0.1`-bound — is reachable by _any_ local process, not just the browser, and by other machines if a bind is ever misconfigured; it forces a bearer-token/auth story the UDS filesystem-permission model gets for free; and it is a standing listener even when no clipping happens. It widens the exact boundary the current design keeps closed, for no capability the native-messaging path lacks.
- **(Rejected) Extension writes clips to a watched drop-folder the daemon ingests.** No synchronous ack (the user can't be shown the committed node), no preview/confirm round-trip, and it couples clipping to a file-sync mechanism (`storage-file`, `canopy-1q5.3`) that does not exist yet. Overlaps with, and would be blocked on, unrelated work.
- **(Rejected) Fold the relay into `apps/cli` as a subcommand.** The `IpcClient` is reusable, but a native-messaging host has a different process contract from an interactive Effect-CLI command: it is browser-launched, speaks length-prefixed stdio (not a TTY), and must enforce the origin allowlist and method narrowing. Mixing that into the human-facing CLI muddies `apps/cli`'s role the same way the daemon design kept the server out of the CLI. A dedicated `apps/clip-host` binary keeps roles clean; it may `import` the `IpcClient` module rather than reimplement it.

Chosen because it reuses the finished UDS server verbatim, keeps the trust boundary at filesystem permissions (the host runs as the same OS user, exactly like `apps/cli`), adds no standing network surface, and concentrates the extension-specific defenses (origin pin, method allowlist, rate limit) in one small enforceable process.

Placement: `apps/extension` (the WebExtension) and `apps/clip-host` (the native host) join `apps/cli`/`apps/daemon`/`apps/web`, both named for what they are per the repo's no-bucket-names convention. `docs/architecture/bounded-contexts.md`'s app map gains both.

## Decision 2 — a clip is a runtime-authored `WebClip` node, not a new kernel type

A clipped page is modeled as an instance of a `WebClip` `NodeType` created at runtime in a non-restricted `clip` namespace through the existing dynamic type-authoring control plane (`createNamespace`, `createNodeType` in `packages/graph/src/ops/type-authoring.ts`). Properties: `title`, `sourceUrl`, `content`, `capturedAt` — all modeled with the existing `string` `PropertyValueKind`. (The kernel's `PropertyValueKind` set is `string | number | boolean | reference`; there is no `url` or `datetime` kind, so a URL and an ISO timestamp are `string` properties, exactly as `canopy-goi`/`canopy-ayv` modeled their domain fields.)

This is the same path `canopy-goi` (Task/Project/Person) and `canopy-ayv` (Cadence) took — both built entirely through the control plane with zero (`canopy-ayv`) or near-zero (`canopy-goi`) kernel changes. The project direction is explicit: "everything is a node," and hardcoding domain types into the kernel was rejected during the domain-content-types brainstorming.

The `clip` namespace + `WebClip` type are **ensured idempotently** before the first clip commits: the client queries for an existing non-deleted `WebClip` `NodeType` in the `clip` namespace and, if absent, authors it via the type-authoring ops (this is why the host allowlist includes the read/query methods). They are **not** seeded into kernel bootstrap.

Instances are created through the existing `canopy.v1.draft.*` flow: `draft.create` → `draft.apply` (a `NodeCreated` event for the `WebClip` instance) → `draft.preview` → user confirms → `draft.commit`. This reuses the preview/commit path wholesale and gives the mandatory user-confirmation gate for free.

Why this over the alternatives:

- **(Rejected) A built-in `WebClip` kernel type seeded in bootstrap.** Violates invariant 1 (`@canopy/graph` is the leaf with no domain knowledge), contradicts the "author types at runtime" direction proven twice already, and re-introduces exactly the hardcoded-domain-type shortcut the project deliberately rejected. It would also make the clip shape un-evolvable without a kernel release.
- **(Rejected) A bespoke non-node clip store.** Defeats the "everything is a node" model, loses graph query/edge/history for free, and needs its own persistence — none of which a clip needs that a node lacks.
- **(Considered) Author the type via the Schema UI as a manual prerequisite.** Fine as a user-driven option, but making the clip flow depend on a human first defining the type in `apps/web` is poor first-run UX; idempotent ensure-on-first-clip is better and still goes through the same public ops.

## Risks / Trade-offs

- Native-messaging message-size caps (Chromium caps a single host→extension message at ~1 MB) and the UDS server's 10 MB per-line cap → cap captured `content` size and prefer extracted main content over raw full-page HTML; reject oversize clips with a clear error rather than truncating silently.
- Host is a standing same-user process while the browser holds the port → it holds one extra UDS client connection (same cost as `apps/cli`); it does no work except when relaying; connection-scoped cleanup mirrors the CLI client.
- Daemon-revision token is a wall-clock string (`DraftSession` known limitation, already filed for hardening in the daemon design) → clip commits inherit the same `concurrent-modification` re-preview/retry semantics; not worsened by this change.
- First-run friction: the native-messaging host manifest must be installed into browser-specific config dirs → documented setup step; a `clip-host` install helper is a task, not a kernel concern.

## Migration Plan

Additive and reversible. Add `apps/extension` and `apps/clip-host`; `apps/daemon` and `@canopy/graph` are untouched. `@canopy/api-adapter` gains one relocated module (`IpcClient`, moved from `apps/cli`, see Decision 1) and no behavior change to any existing method — the bridge is another UDS client using existing methods verbatim. `apps/cli` gets a one-line import-path change (same client, new location), no logic change. The `clip` namespace + `WebClip` type are authored at runtime, so there is no storage or schema migration. Rollback: uninstall the native-messaging host manifest and remove both new apps; `IpcClient`'s relocation can be reverted independently (it is a pure move); already-created `WebClip` nodes remain valid graph nodes (the append-only log keeps them recoverable/auditable regardless).

## Open Questions

- Should the host enforce method scoping alone, or should the daemon grow the `authContext.scopes` hook (already anticipated in the daemon design) so a connection can be pinned to clip-only server-side? v1 enforces at the host; server-side scopes are the cleaner long-term home and can be a follow-up.
- Long-lived native-messaging port (`connectNative`) vs. per-message spawn (`sendNativeMessage`): a long-lived port avoids repeated UDS-connect + handshake per clip; confirm during implementation that idle-lifecycle and reconnect behavior are acceptable.
- Whether best-effort retry on daemon-unavailable is enough, or durable offline capture (queue clips in extension storage) is needed — defer until dogfooding shows the failure is common.

## Adversarial review and mitigations

### Resource and performance overhead

- **Extra standing UDS client.** The host holds one daemon UDS connection for the browser session. Mitigation: a single long-lived `IpcClient` connection reused across clips (not per-clip connect), connection-scoped cleanup mirroring `apps/cli`; the host does no background work between relays.
- **Large clip payloads.** Full-page HTML can exceed native-messaging (~1 MB host→extension) and UDS (10 MB per line) caps and can bloat draft-overlay projection cost on the daemon. Mitigation: cap captured `content`, prefer extracted main content over raw HTML, reject oversize clips with a typed error; the draft `preview` already returns only a bounded diff summary, not a full graph.
- **Draft-overlay recomputation.** Each `preview` reprojects the overlay (O(parent + staged)). A clip stages a single small `NodeCreated`, so cost is negligible; the daemon's existing per-connection and global draft caps bound any abuse.

### Failure modes and edge cases

- **Daemon not running.** Host's UDS connect returns `ECONNREFUSED`. Mitigation: host returns a typed "daemon unavailable" error; extension keeps the captured payload and lets the user retry; the host does not tear down the native-messaging port on a transient failure.
- **Native-messaging host not installed / manifest missing.** Browser reports a connection failure. Mitigation: extension detects the missing port and shows setup guidance rather than failing opaquely.
- **Concurrent modification on commit.** Parent graph advanced while the clip draft was open. Mitigation: inherit the `draft.commit` `concurrent-modification` domain error + re-`preview`/retry flow unchanged.
- **Partial capture on SPA/lazy pages.** Content not yet rendered at capture time. Mitigation: capture is best-effort and the user always sees the preview before confirming, so a bad capture is visibly discardable, never silently committed.
- **Oversize or malformed clip.** Mitigation: host and extension validate size and required fields; a malformed clip is rejected before `draft.apply`, leaving no partial state (the draft flow already stages atomically).

### Security and isolation (primary risk area)

A browser extension is a materially larger attack surface than the same-user CLI/daemon pair. The analysis and layered mitigations:

- **Content-script injection / hostile page content.** The content script runs in the context of arbitrary untrusted pages; page JS could try to smuggle executable or oversized content into a clip. Mitigation: the content script extracts only inert data (strings) and never executes or forwards page-provided code; all captured content is carried as string properties on a node, never as instructions; the clip is a data node, so worst case is unwanted text in a node the user previewed and confirmed.
- **Malicious or compromised extension update.** A web-store auto-update could turn the extension hostile and try to drive graph writes. Mitigations, layered: (a) **user-confirmation gate** — every clip goes through `draft.preview` and requires an explicit user confirm before `commit`, so a background flood is visible and blockable, and nothing is written without a user-initiated capture; (b) **method allowlist at the host** — the host relays only handshake + `draft.*` + clip-namespace `createNode` + the ensure-type reads, rejecting the broader `mutation.*` surface (deletes, arbitrary-namespace writes) locally; (c) **origin pin** — the native-messaging manifest's `allowed_origins`/`allowed_extensions` restricts the connecting client to the blessed extension ID; (d) **rate limit** at the host.
- **What the native-messaging host can be tricked into.** The host is same-user and the daemon UDS already grants any same-user process full graph access, so a transparent proxy would hand the extension the whole graph. Mitigation: the host is explicitly a **narrowing** proxy — it constrains method and namespace and never widens authority beyond the clip allowlist; it is the enforcement point precisely because the extension is the least-trusted component. This uses the `authContext.scopes` direction the daemon design anticipated; server-side scope enforcement is the cleaner long-term home (Open Questions) but is not required for v1 safety because the host enforces it.
- **Should any website content create graph nodes without user confirmation?** No. v1 requires an explicit user capture action _and_ an explicit confirm of the preview. No auto-clipping, no background capture, no silent commit. This is a hard requirement in `web-clip-capture`, not a UX nicety.
- **Manifest tampering.** A same-user process could overwrite the native-messaging host manifest to point at a different binary. Mitigation: this is equivalent to any same-user compromise (the attacker could already open the UDS directly); it is not a new boundary this design introduces. Noted, not solved here — same-user trust is the daemon's documented model.
- **Trust boundary summary.** browser (same-user) → host (same-user) → UDS (same-user). The genuinely new element is the _remotely-updatable, page-exposed extension code_; the host is the trust chokepoint that keeps a compromised extension bounded to previewed, user-confirmed, clip-namespace writes.

### Migration and backward compatibility

- **Additive, plus one internal relocation.** New `apps/extension` and `apps/clip-host`; no change to `apps/daemon` or `@canopy/graph`. `@canopy/api-adapter` gains a relocated `IpcClient` module (moved from `apps/cli`, exported alongside `ipc-server.ts`) with no behavior change; `apps/cli` updates one import path to the new location. The bridge otherwise uses existing `handshake`/`draft.*`/`createNode`/`query.*` methods verbatim. No protocol version bump.
- **No data migration.** The `clip` namespace + `WebClip` type are authored at runtime through public ops, not seeded into bootstrap; no on-disk or schema change.
- **Reversibility.** Uninstall the host manifest and drop both apps; existing `WebClip` nodes remain valid and, being event-log-backed, remain recoverable and auditable.
