# Decisions

A running, append-only log of decisions that shape current-state architecture but are too small or too tactical to warrant their own dated design doc.
Newest entries first.
Each entry states the decision, why, and where the full reasoning lives.

Full design proposals still live in `design/` (dated, one file per proposal).
This log complements those files — it's where decisions made _during_ implementation of an approved design get recorded, so they don't only live in a PR description or an agent's private memory.

## 2026-08-22 — Consolidated dual TypeScript compilers to single typescript@6.0.3 across all entrypoints (canopy-08x.3)

The dual-compiler setup from `canopy-1qb` (`typescript@6.0.3` for `typescript-eslint` and direct invocations; `typescript-native@npm:typescript@7.0.2` via root `PATH` overrides for `build` and `typecheck`) resulted in split compiler authorities across root vs per-workspace scripts and between `packages/*` and `apps/*`.
With TypeScript 7.1 in development (~95% milestone completion, targeting stable programmatic compiler API support needed by `typescript-eslint`), maintaining the dual-compiler alias and shell `PATH` overrides before 7.1's release introduced build drift without a unified compiler authority.

Decision — **Consolidate to a single `typescript@6.0.3` compiler across all entrypoints.**
`typescript-native` is removed from `devDependencies` and the `PATH` overrides are stripped from `build` and `typecheck` scripts in `package.json`.
A single compiler version (`6.0.3`, the latest 6.x release) now uniformly governs all builds, typechecks, ESLint type services, and direct per-package runs.
Future upgrade to TypeScript 7.1 will occur as a single unified migration once TypeScript 7.1 and `typescript-eslint` declare compatibility (tracked by deferred bead `canopy-x1j`).

## 2026-08-16 — Kernel stays Effect-free; plain-functional is the toolkit for the eslint-disable elimination (canopy-v9o.1.1)

The `eslint-disable` elimination epic (`canopy-v9o.1`) has 22 per-package rewrite beads blocked on one question: which functional toolkit the kernel is rewritten against.
`@canopy/graph` carries the largest disable mass (250 directives) yet is Effect-free by design — a dependency-light leaf with a hand-rolled `Result<T, E>` (`packages/graph/src/result.ts`).
The fork was (A) adopt `effect` inside the kernel, replacing `Result`, vs (B) keep the kernel Effect-free with plain-functional patterns and confine `effect` to the app/adapter boundary where it already lives.

Decision — **(B) the kernel stays Effect-free.**
Kernel-tier packages (`@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage*`) are rewritten with `map`/`filter`/`reduce`/`fold`, the existing `Result<T, E>`, and `readonly` structural updates; `effect` is not added to any of them.
`effect` remains permitted only in `@canopy/api-adapter` and the apps (`apps/{web,cli,daemon,clip-host}`), where measurement showed it is used as an outer runner (`Effect`/`Console` at the process/IPC edge), not woven through domain logic.

Why B over A:
(1) The leaf invariant (AGENTS.md #1) is load-bearing and being _tightened_ by the concurrent `canopy-jxw` work (its F2 removes the leaf's last internal dev-cycle dependency); adding a large runtime to the most-depended-on package contradicts that and ripples through `queries`/`settings`/`storage*`.
(2) "Uniformity with the apps" is largely illusory — the apps do not use Effect's `Either` for domain errors, so adopting Effect in the kernel would make the kernel _more_ Effect-dependent than the code it unifies with, just relocating the `Result`↔`Effect` seam inward from the natural adapter boundary.
(3) The disables don't need Effect: of the 250 in `@canopy/graph`, 155 are the two perf-critical hot files carved out to `canopy-v9o.1.2`; the remaining ~95 are ordinary `no-let`/`no-loop`/`immutable-data`/`no-try` that rewrite to language constructs with zero library.
(4) Option A is a monorepo-wide `Result`→`Effect` breaking migration that buys nothing the plain-functional path doesn't.

Supporting decisions:

- **No bucket package.** No `@canopy/functional` grab-bag (the owner is strongly opposed to bucket packages). A pure helper that genuinely recurs across kernel-tier packages (a test `assertDefined`, a `Result`-aware fold/`traverse`, immutable `Map`/`Set` updates) is added as a named, domain-neutral export of `@canopy/graph` — already the universal leaf import — and only once a second caller exists; single-caller helpers stay inline.
- **No `@canopy/graph` split is motivated by this work.** The disable mass is the two hot files plus ordinary projection/session/ops code, not a bounded-context seam; any split remains owned by `canopy-jxw`.

Revisit triggers (reopen via a new design change, not ad hoc): kernel-tier code needing structured concurrency, cancellation, or typed dependency injection that plain-functional patterns cannot express cleanly; the hand-rolled `Result` demonstrably diverging from adapter Effect error handling in a way that causes real bugs; or a future `@canopy/graph` split changing which package is the leaf and reopening the dependency-weight calculus.

Full reasoning and adversarial review: `openspec/changes/kernel-functional-toolkit/` (proposal, design, spec).
The elimination playbook (`docs/research/2026-08-15-eliminating-eslint-disables-playbook.md`) is updated to make plain-functional the unconditional default, unblocking rewrite beads `canopy-v9o.1.5`–`.26`.

## 2026-08-03 — Identified root causes for package version drift and automated workspace dependency alignment (canopy-ckd)

Analysis of 116 Dependabot PRs and cross-package `package.json` configurations identified three primary causes of dependency version drift:
(1) Subpackages declaring independent, mismatched version specifiers when adding dependencies (e.g., `zod: ^4.4.3` in `@canopy/api-adapter` versus `^4.4.1` in `@canopy/graph`, `@canopy/storage-file`, and `apps/web`).
(2) Un-ignored pinned dependencies in `.github/dependabot.yml` generating redundant PRs that break build/tooling gates (e.g., Dependabot PR #405 proposing a major `typescript` 6.0.3 → 7.0.2 bump, which breaks `@typescript-eslint` compatibility while the `typescript-native` dual-compiler setup from `canopy-1qb` is active).
(3) Manual package additions bypassing workspace version checks and Dependabot's 14-day release cooldown window.

Mitigations implemented:
(1) Standardized `zod` to `^4.4.1` across all workspace packages in [package.json](file:///home/mkobit/workspace/mkobit/canopy/packages/api-adapter/package.json).
(2) Configured `.github/dependabot.yml` with `ignore` for `typescript` semver-major updates to prevent invalid PR generation during the dual-compiler transition.
(3) Extended [verify-versions.ts](file:///home/mkobit/workspace/mkobit/canopy/tools/verify-versions.ts) to scan all workspace `package.json` files and enforce identical version specifiers across all non-workspace dependencies as part of `bun run check:versions` and `bun run lint`.

## 2026-07-29 — Fixed the TypeScript 7 dual-compiler interim setup (canopy-1qb)

`upgrade-typescript` (PR #380, 2026-07-22) tried to adopt TypeScript 7's Go-based native compiler for its 8-12x build speedup while keeping `typescript-eslint` working, since TS 7.0 shipped without the old programmatic compiler API that `typescript-eslint` depends on (confirmed via Microsoft's [TS 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and [typescript-eslint#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518) — this is an acknowledged, industry-wide gap, not specific to this repo).
The dual-package strategy itself (plain `typescript` stays on 6.x for tooling, the fast compiler is aliased under a different devDependency name for the actual build) matches Microsoft's own recommended interim workaround.
But the execution was broken: it pinned `typescript-native` to `npm:typescript@7.0.1-rc` (a stale release candidate; `7.0.2` is GA) and wired the swap through a `postinstall` script (`ln -sf ../typescript-native/bin/tsc node_modules/.bin/tsc`) that could never run in this repo — `bunfig.toml` has had `[install] ignoreScripts = true` since PR #197 (long predating this change), which unconditionally blocks every lifecycle script including the root project's own, on every install, not just when a lockfile is unchanged. Confirmed empirically: even a full `bun install --force` never fired a test postinstall. So `tsc` always fell back to plain 6.0.3, and the "TS 7 validated" claim in the openspec change's `tasks.md` was never actually exercised.
Fixed by bumping to stable `typescript-native@npm:typescript@7.0.2` and replacing the postinstall symlink race with a `PATH` prefix (`PATH="$PWD/node_modules/typescript-native/bin:$PATH"`) on the root `build`/`typecheck` scripts, which propagates deterministically to every `bun --filter` fan-out without touching `node_modules/.bin/tsc` (left alone, so `typescript-eslint`'s `require('typescript')` resolution is unaffected).
Verified: full `build`/`typecheck`/`lint`/`test` all pass clean under this wiring.
Microsoft has committed to shipping the real programmatic API in TypeScript 7.1 (~3-4 months after 7.0), at which point `typescript-eslint` is expected to add proper support and this dual-package workaround can be dropped — see `canopy-1qb` and its TS-7.1 follow-up bead.

## 2026-07-26 — Established recurring audit process and automated release checks for AI developer tools

We created an automated release audit script (`tools/audit-ai-tool-releases.ts` accessible via `bun run audit:ai-tools`) to query upstream releases for `@fission-ai/openspec` and `gastownhall/beads`.
The recurring audit workflow and upgrade procedures are documented in `docs/architecture/ai-tooling-audit-process.md`.

## 2026-07-21 — Mandated TypeScript for all developer scripts and Git hooks

To maintain consistency with project tooling (Vite, Bun, Vitest, ESLint), we will only author developer scripts and Git hooks in TypeScript.
This avoids introducing external runtimes and package managers (like Python and `uv`) into the project's build and lint pipelines.
Any new hooks or scripts must run via Bun and TypeScript, and are verified by the existing lint and typecheck gates.

## 2026-07-21 — Formalized mandatory adversarial review phase for OpenSpec design proposals

All design proposals must now undergo a mandatory adversarial review phase prior to staging implementation tasks.
This requires that the `design.md` file include an `## Adversarial review and mitigations` section that analyzes resource limits, edge cases, security, and migration risks.
No task beads or implementation tasks may be created or claimed until mitigations for these risks are approved.

## 2026-07-05 — `apps/web`'s Playwright e2e suite binds a random port, not a fixed one

`playwright.config.ts` used to hardcode `http://localhost:5173` for both `webServer` and `baseURL`.
`reuseExistingServer: !process.env.CI` (the default locally) meant Playwright silently reused _whatever_ was already listening on that port instead of verifying it was canopy's own dev server — during `canopy-1q5.8`'s quality-gate run, an unrelated project's Vite dev server already held 5173, so the suite ran against the wrong app entirely and failed for a misleading reason.
Fixed by computing a free ephemeral port at config-load time (`node:net`, `listen(0)`) and passing it to both the `vite --port` command and `baseURL`; the port is cached in `process.env.CANOPY_E2E_PORT` so worker processes (which reload the config independently) agree with the process that started the web server, and `reuseExistingServer` is now unconditionally `false` since a random port never has anything preexisting to reuse.
Manual `bun run dev` is untouched and keeps Vite's normal fixed default — only the automated harness needed this, since a human eyeballing a browser tab would immediately notice the wrong app, but an automated suite would not.

## 2026-07-05 — Block content stays on the `content` property, not `text`

`docs/design/2026-02-06-content-model.md` prescribed a naming split: TextBlock/CodeBlock use `text` (literal content), MarkdownNode uses `content` (renderer-interpreted).
`bootstrap.ts` never implemented this — all three block `NodeType`s use `content`, and rendering is a hardcoded `switch (node.type)` in `block-renderer.tsx`, not yet resolved through the graph-resident `Renderer` concept (`meta:renderer`/`RENDERER_DEF`) that would make the split meaningful.
Rather than bundle a schema/rendering change into the `canopy-1q5.7` storage-plumbing cutover, `content` was kept everywhere and the drift was left for a dedicated bead.
See `canopy-a1s`.
This property naming drift has been resolved by updating `docs/design/2026-02-06-content-model.md` to standardize on `content` across all block types to match reality.

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
