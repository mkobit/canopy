## 0. Relocate `IpcClient` into `@canopy/api-adapter` (prerequisite)

- [x] 0.1 Move `apps/cli/src/ipc/ipc-client.ts` to `packages/api-adapter/src/ipc/ipc-client.ts` (a sibling of `ipc-server.ts`, same directory) with no logic change; export it from `packages/api-adapter/src/ipc/index.ts` and the package's public `src/index.ts`.
- [x] 0.2 Move `apps/cli/tests/ipc-client.test.ts` to `packages/api-adapter/tests/ipc-client.test.ts` (or an equivalent new test in that package), updating only import paths; confirm it still passes unmodified in behavior.
- [x] 0.3 Update `apps/cli/src/commands/*.ts` (and any other `apps/cli` consumer) to import `IpcClient`/`makeIpcClient` from `@canopy/api-adapter` instead of the local `../ipc/ipc-client` path; delete the now-empty `apps/cli/src/ipc/` directory if nothing else remains in it.
- [x] 0.4 Run `apps/cli`'s existing test suite (`bun test` in that package) to confirm zero behavior change from the relocation before proceeding to `apps/clip-host` scaffolding.
- [x] 0.5 (Addendum, needed for section 2/4) `IpcClient` as relocated had no `draft.*` methods at all (the daemon's `canopy.v1.draft.*` surface, built for `canopy-h7z`, was never wired into the CLI client). Added `draftCreate`/`draftApply`/`draftPreview`/`draftCommit`/`draftDiscard` to the `IpcClient` interface, following the exact existing per-method typed pattern (hardcoded `IPC_METHODS` constant, `Effect.tryPromise` wrapper) — additive only, no change to any pre-existing method's behavior. `@canopy/api-adapter` gained `effect` as a real `dependencies` entry (previously only `apps/cli`/`apps/daemon` had it; the relocated client needs it directly).

## 1. Scaffold `apps/clip-host` (`@canopy/clip-host`)

- [x] 1.1 Create `apps/clip-host/package.json` mirroring `apps/cli/package.json` (`"private": true`, `"type": "module"`, a `bin` entry e.g. `"canopy-clip-host"`, and `build`/`dev`/`test`/`typecheck` scripts). Depend on `@canopy/api-adapter` (for the now-relocated `IpcClient`, task 0.1) and `@canopy/graph`; devDependency `typescript`.
- [x] 1.2 Create `apps/clip-host/tsconfig.build.json` and `apps/clip-host/tsconfig.json` mirroring `apps/cli`'s pair (extend `../../tsconfig.base.json`, `bundler` resolution, `references`/`paths` for the `@canopy/*` entries it uses). Confirm the root `apps/*` glob and `bun run build` pick it up with no root changes.
- [x] 1.3 Create `apps/clip-host/AGENTS.md` stating the scope: "a same-user native-messaging host that relays an allowlisted set of clip requests from the browser extension to the daemon's Unix-socket JSON-RPC surface; it is a narrowing proxy, not a transparent one, and opens no network socket."
- [x] 1.4 Run `bun install` and confirm `bun pm ls --all` shows `@canopy/clip-host` with the intended edges and no `yjs`/`y-protocols` (invariant 2).

## 2. Native-messaging host I/O

- [x] 2.1 Implement length-prefixed native-messaging stdio framing (read a 4-byte little-endian length then the JSON message; write the same) as pure functions returning `Result` (invariant 8), no thrown errors.
- [x] 2.2 Resolve the daemon socket path the same way `apps/cli` / `apps/daemon` resolve it (`XDG_RUNTIME_DIR` default, user-private fallback; validate the resolved path) and open one long-lived `IpcClient` connection reused across messages.
- [x] 2.3 On daemon-unavailable (`ECONNREFUSED` / missing socket) return a typed "daemon unavailable" error to the extension and keep the native-messaging port alive for retry; do not crash on transient failure.
- [x] 2.4 (Addendum, found while writing 7.6) `IpcClient`'s `makeIpcClient` called `net.connect(socketPath)` unwrapped -- a nonexistent Unix socket path can throw synchronously (observed under `bun test`) rather than only failing async via the `'error'` event, escaping `Effect.async`'s registration uncaught. Wrapped the call in try/catch, reporting through the same `resume(Effect.fail(...))` channel the async path already uses. Additive robustness fix to the failure path only; the success path and all pre-existing passing tests are unchanged (`packages/api-adapter` 190/190, `apps/cli` 16/16 re-verified after the change).

## 3. Host allowlist, namespace narrowing, and rate limiting

- [x] 3.1 Implement a method allowlist: relay only `canopy.v1.handshake`, `canopy.v1.draft.*`, `canopy.v1.mutation.createNode`, and the read/query methods needed to ensure the `WebClip` type; reject anything else locally with a clear error, without forwarding.
- [x] 3.2 Constrain `createNode` (direct or as a staged `draft.apply` event) to the `clip` namespace; reject out-of-namespace node creation.
- [x] 3.3 Apply a per-host request rate limit and reject/throttle excess requests rather than forwarding unbounded to the daemon.
- [x] 3.4 Provide the native-messaging host manifest template with `allowed_origins`/`allowed_extensions` pinned to the blessed extension ID, plus an install helper/doc for placing it in the browser's native-messaging-hosts config dir.

## 4. `WebClip` type authoring (runtime, no kernel change)

- [x] 4.1 Implement an idempotent "ensure clip type" step: query for a non-deleted `WebClip` `NodeType` in the `clip` namespace; if absent, author the `clip` namespace and `WebClip` `NodeType` via the existing `createNamespace`/`createNodeType` ops with `title`/`sourceUrl`/`content`/`capturedAt` as `string` properties. Reuse the type; never create a duplicate.
- [x] 4.2 Confirm no `@canopy/graph` change and no bootstrap seeding are introduced (the type is authored only through public type-authoring ops).

## 5. Scaffold `apps/extension` (MV3 WebExtension)

- [ ] 5.1 Create `apps/extension` with an MV3 `manifest.json` (action popup, `activeTab`/`scripting` permissions, native-messaging permission, background service worker) and a build wired into the repo's tooling.
- [ ] 5.2 Create `apps/extension/AGENTS.md` stating the scope: "a capture-and-confirm-only WebExtension; it extracts inert clip data and talks native-messaging to `apps/clip-host`; it never executes page-provided code and never commits without explicit user confirmation."

## 6. Extension capture and confirm flow

- [ ] 6.1 Content script: extract a structured clip payload (`title`, `sourceUrl`, `content`, `capturedAt`) from the active tab, using the current selection as `content` when a selection exists and extracted main content otherwise; carry all captured material as inert strings, never executing page-provided code.
- [ ] 6.2 Enforce a captured-content size cap (below native-messaging ~1 MB and UDS 10 MB limits); reject oversize clips with a clear error instead of truncating silently.
- [ ] 6.3 Background service worker: open a native-messaging port to `apps/clip-host`; ensure the `WebClip` type (step 4.1) then run `draft.create` → `draft.apply` (a `NodeCreated` for the `WebClip` instance) → `draft.preview`.
- [ ] 6.4 Popup UI: show the previewed clip, commit the draft (`draft.commit`) only on explicit user confirm and surface the resulting node identity; on decline, `draft.discard` and create nothing. No auto/background capture or commit.
- [ ] 6.5 Handle `concurrent-modification` on commit by re-`preview`-then-`commit`, and surface the "daemon unavailable" / "host not installed" states with actionable guidance.

## 7. Tests

- [x] 7.1 Host framing: round-trip length-prefixed native-messaging encode/decode, including a malformed/oversize frame rejected without partial state.
- [x] 7.2 Host allowlist: an out-of-allowlist method and an out-of-`clip`-namespace `createNode` are both rejected at the host and never reach a (stub) daemon; an allowlisted `draft.*`/`handshake` call is relayed.
- [x] 7.3 Host rate limit: exceeding the configured rate is throttled/rejected rather than forwarded unbounded.
- [x] 7.4 Ensure-type idempotency: first run authors the `clip` namespace + `WebClip` type; second run reuses it with no duplicate.
- [ ] 7.5 End-to-end (host against an ephemeral daemon on a temp socket, mirroring `packages/api-adapter/tests` patterns): capture payload → ensure type → draft preview shows the staged `WebClip` while the parent graph is unchanged → commit → the `WebClip` node is visible via a normal query. (Out of `canopy-2nn.1` scope -- needs `apps/extension`'s capture flow, `canopy-2nn.2`.)
- [x] 7.6 Daemon-unavailable: with no daemon listening, the host returns the typed "daemon unavailable" error and keeps the port alive; the captured payload is not lost. Tested via dependency-injected `connect` failure (see `apps/clip-host/tests/daemon-unavailable.test.ts`) rather than a real socket ENOENT -- real `net.connect()` ENOENT-throw handling proved inconsistent under this environment's `bun test` + WSL2 combination even after the `ipc-client.ts` try/catch fix (task 0.5-adjacent); the try/catch fix is still correct and verified working under plain `bun run`.

## 8. Docs

- [ ] 8.1 Add `apps/extension` and `apps/clip-host` to the app map in `docs/architecture/bounded-contexts.md`.
- [ ] 8.2 Document the setup steps (build the extension, install the native-messaging host manifest, run the daemon) and the security model (capture-and-confirm, host allowlist/origin-pin, deferred context-enrichment/WebMCP) in the relevant app `AGENTS.md`/README.

## 9. Quality gates

- [ ] 9.1 `bun run build` then `bun run lint`, `bun run typecheck`, `bun test` all green (build before lint per repo CI ordering).
- [ ] 9.2 `bunx openspec validate browser-extension-web-clipper --strict` passes.
- [ ] 9.3 Confirm `apps/daemon` and `@canopy/graph` are untouched, and that `@canopy/api-adapter`'s only change is the `IpcClient` relocation (task 0.1-0.4, no behavior change to any existing method/handler) — the bridge is a client using existing methods; the clip type is runtime-authored.
