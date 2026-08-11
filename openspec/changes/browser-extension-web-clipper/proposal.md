## Why

Canopy has no capture path from the browser today — getting a web page or selection into the graph requires manually creating a node in `apps/web`.
Obsidian's web clipper is the closest reference point: click to clip the current page or a selection, and it lands in the vault.
The write surface to land a clip already exists (`apps/daemon` hosts `@canopy/api-adapter`'s Unix-domain-socket JSON-RPC server with `canopy.v1.mutation.createNode` and the `canopy.v1.draft.*` preview/commit flow), but a browser extension is a _remote, sandboxed, different-process_ client that cannot open a Unix domain socket directly and is not "the same OS-user process" in the sense the daemon's trust model assumes.
This change designs the bridge across that boundary and the node shape a clip takes — the first real design pass on a browser extension for Canopy (epic `canopy-2nn`).

## What Changes

- Add a browser WebExtension (`apps/extension`, Manifest V3) that captures the current page or a user selection into a structured clip payload (title, source URL, extracted content, capture timestamp) and shows a preview the user confirms before anything is written.
- Add a **native messaging host** bridge (`apps/clip-host`) — a small same-user companion process the extension talks to over the browser's native-messaging stdio protocol, which relays to the daemon's existing Unix-socket JSON-RPC surface via the same `IpcClient` plumbing `apps/cli` already uses. No new daemon transport, no localhost network port.
- Land a clip as an instance of a runtime-authored `WebClip` `NodeType` in a non-restricted `clip` namespace, created through the existing dynamic type-authoring control plane (`createNamespace`/`createNodeType`) and committed through the existing `canopy.v1.draft.*` two-phase flow. No new kernel type, no `@canopy/graph` change.
- Constrain the bridge to a narrow method allowlist (clip-namespace `createNode` plus the `draft.*` preview/commit family) rather than proxying the full `canopy.v1.mutation.*` surface, so a compromised extension cannot drive arbitrary graph mutations.
- Explicitly defer "context enrichment" (using clipped/browsing content to enrich other graph nodes) and "WebMCP" (an MCP surface from the browser context) — named in the epic as future ideas, not designed here.

## Capabilities

### New Capabilities

- `web-clip-capture`: a browser extension captures the current page or selection into a structured clip and lands it as a runtime-authored `WebClip` node after explicit user confirmation of a preview.
- `native-messaging-bridge`: a same-user native-messaging host relays a narrow, allowlisted set of extension requests to the daemon's existing Unix-socket JSON-RPC surface; it is a narrowing client, not a transparent proxy, and adds no new daemon transport.

### Modified Capabilities

<!-- None. The bridge is another UDS client using the existing handshake/draft/mutation methods verbatim; it changes no documented requirement of unix-socket-ipc-transport or graph-api-access. The WebClip type is authored at runtime through type-authoring with no change to that capability's requirements. -->

## Impact

- `apps/extension` (new): MV3 WebExtension — action popup, content script (structured DOM/selection extraction, no page-code execution), and background service worker that opens a native-messaging port to the host. UI is capture-and-confirm only.
- `apps/clip-host` (new): native-messaging host binary registered with the browser via a host manifest whose `allowed_origins`/`allowed_extensions` pins the blessed extension ID; relays allowlisted requests to the daemon UDS via `@canopy/api-adapter`'s `IpcClient`; rate-limits and rejects out-of-allowlist methods.
- `apps/daemon`, `@canopy/api-adapter`, `@canopy/graph`: unchanged. The bridge consumes the existing `handshake`, `draft.*`, `mutation.createNode`, and `query.*` methods as-is; the `WebClip` type is authored at runtime.
- `docs/architecture/bounded-contexts.md`: add `apps/extension` and `apps/clip-host` to the app map.
- No storage or schema migration; the `clip` namespace + `WebClip` `NodeType` are created idempotently at runtime, not seeded into kernel bootstrap.
