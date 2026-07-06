# Decisions

A running, append-only log of decisions that shape current-state architecture but are too small or too tactical to warrant their own dated design doc.
Newest entries first.
Each entry states the decision, why, and where the full reasoning lives.

Full design proposals still live in `design/` (dated, one file per proposal).
This log complements those files — it's where decisions made *during* implementation of an approved design get recorded, so they don't only live in a PR description or an agent's private memory.

## 2026-07-05 — `apps/web`'s Playwright e2e suite binds a random port, not a fixed one

`playwright.config.ts` used to hardcode `http://localhost:5173` for both `webServer` and `baseURL`.
`reuseExistingServer: !process.env.CI` (the default locally) meant Playwright silently reused *whatever* was already listening on that port instead of verifying it was canopy's own dev server — during `canopy-1q5.8`'s quality-gate run, an unrelated project's Vite dev server already held 5173, so the suite ran against the wrong app entirely and failed for a misleading reason.
Fixed by computing a free ephemeral port at config-load time (`node:net`, `listen(0)`) and passing it to both the `vite --port` command and `baseURL`; the port is cached in `process.env.CANOPY_E2E_PORT` so worker processes (which reload the config independently) agree with the process that started the web server, and `reuseExistingServer` is now unconditionally `false` since a random port never has anything preexisting to reuse.
Manual `bun run dev` is untouched and keeps Vite's normal fixed default — only the automated harness needed this, since a human eyeballing a browser tab would immediately notice the wrong app, but an automated suite would not.

## 2026-07-05 — Block content stays on the `content` property, not `text`

`docs/design/2026-02-06-content-model.md` prescribes a naming split: TextBlock/CodeBlock use `text` (literal content), MarkdownNode uses `content` (renderer-interpreted).
`bootstrap.ts` never implemented this — all three block `NodeType`s use `content`, and rendering is a hardcoded `switch (node.type)` in `block-renderer.tsx`, not yet resolved through the graph-resident `Renderer` concept (`meta:renderer`/`RENDERER_DEF`) that would make the split meaningful.
Rather than bundle a schema/rendering change into the `canopy-1q5.7` storage-plumbing cutover, `content` was kept everywhere and the drift was left for a dedicated bead.
See `canopy-a1s`.

## 2026-07-05 — Legacy Yjs vault import dropped (canopy-1q5.7 task 3.1)

The openspec change `event-log-source-of-truth` planned a one-time import of existing Yjs-snapshot vaults into the new event log.
No real vaults exist pre-1.0 — all dogfood data is fabricated and disposable — so there was nothing to migrate.
The deprecated `StorageAdapter`/`createIndexedDBAdapter`/`GraphStorageMetadata` are left in place with zero live callers, a clean deletion target for `canopy-1q5.8`.
This also removes the original plan's "let `canopy-1q5.7` soak before removing Yjs" rollback safety net as a non-concern.
See `openspec/changes/event-log-source-of-truth/design.md` (Amendments) and bd memory `canopy-1q5-7-implementation-deviations`.

## 2026-07-05 — Added a dedicated graph registry (`@canopy/storage-indexeddb`'s `createGraphRegistry`)

Cutting `apps/web` over to `EventLogStore` removed the only thing that let the home page list/create/delete named graphs: the deprecated `StorageAdapter`'s metadata side-table.
`EventLogStore` is intentionally scoped to a known `graphId` with no enumerate-all-graphs operation, and does not gain one here.
A new, independent IndexedDB store (`{id, name, createdAt, updatedAt}`, no coupling to snapshots or events) backs the home page instead, keeping the deprecated adapter untouched and purely a deletion target.

## 2026-07-03 — Event log is the sole persisted source of truth; Yjs removed entirely

Graph persistence is CQRS: append-only `GraphEvent`s in an `EventLogStore`, with the materialized `Graph` a rebuildable projection.
Yjs (character-level CRDT) buys nothing without a real-time transport, and the content model already models blocks as plain-string properties, so whole-property last-writer-wins at block granularity is accepted (the losing side of any conflict stays recoverable in the event log).
Full design: `docs/design/2026-07-03-event-log-storage-and-sync.md`; implementation: openspec change `event-log-source-of-truth`, epic `canopy-1q5`.
