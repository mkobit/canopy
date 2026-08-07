# Comparative research: Logseq DB architecture vs Canopy graph architecture

This document compares Logseq's database-backed rewrite ("Logseq DB," beta as of the sources below) against Canopy's own architecture, and draws concrete design insights for Canopy's evolution.
Research conducted 2026-08-03 via two parallel investigations: external web research on Logseq DB, and an internal source audit of Canopy.

## Executive summary

Both systems converged on similar high-level bets from different starting points: unify pages/blocks/nodes into one addressable concept, make properties first-class and typed, and treat AI agents as tool-callers rather than live co-editors.
They diverge sharply on sync: Logseq built a custom, only partially documented CRDT-inspired rebase protocol behind a closed-source server; Canopy deliberately rejected CRDTs in favor of a fully open event log with per-property last-writer-wins, at the cost of losing fine-grained (e.g. character-level) merge.
Logseq ships a working, if young, product surface — an official MCP server, a real Datalog query engine, a plugin marketplace with 65+ DB-compatible plugins — that validates several of Canopy's still-partially-implemented bets (WASM plugin sandboxing, IPC-based agent access, meta-circular node typing) but also exposes gaps Canopy hasn't closed yet (query indexing/planning, a shipped daemon host, an MCP-compatible adapter, dry-run previews for agent writes).
The most actionable insight: Canopy already has the primitive Logseq had to bolt on after the fact — `DraftSession` (packages/graph/src/draft-session.ts) is architecturally the same idea as Logseq's "pretend mode" dry-run for AI edits, but it is not yet exposed over the IPC/agent surface.
Two deep dives (§6, §7) go further than comparison and check Canopy's own "decided" and "draft" design docs against their own stated goals, using Logseq as a stress test rather than a target: the event-log storage decision holds up well against its actual goal (single-user multi-device durability/auditability, not Logseq's real-time multi-user collaboration goal), with query performance under agentic load as the one genuinely unmeasured risk; the plugin/extension model's security primitives are individually more rigorous than Logseq's, but the architecture as a whole is not yet rock solid — the wizard doc's HTML-injection mitigation doesn't cover the conceptual renderer interface that will need it most, and the plugin manifest's declared capabilities don't yet connect to the runtime capability check.

## Methodology and source currency

**Logseq side**: web research against primary sources — the official `logseq/docs` repo (`db-version.md`, `db-version-changes.md`, dated 2026-04-28), plus DeepWiki's source-grounded architecture wiki for `logseq/logseq` (commit `3de7c751`) and the Logseq community forum.
The DB version is officially beta (RTC sync/mobile alpha); several internals (exact CRDT semantics, on-disk SQLite table layout, RTC server ordering authority) are not documented publicly and would require reading Logseq's ClojureScript source directly (`worker/rtc/*`, `worker/sync/*`) to confirm — flagged inline below wherever a claim rests on inference rather than a primary statement.

**Canopy side**: direct source audit — `AGENTS.md`, `docs/design/2025-01-21-canopy-design-v0.1.md`, `docs/architecture/bounded-contexts.md`, `docs/architecture/decisions.md`, `docs/design/2026-07-03-event-log-storage-and-sync.md`, `.jules/AGENTS.md`, and the `packages/*/src` trees, with file:line citations throughout.
Note: the repo has grown past what `AGENTS.md`/`bounded-contexts.md` describe — nine packages plus `apps/cli` now exist (`storage-http`, `storage-file`, `api-adapter` are undocumented in the "six packages" list) — treat those docs as canonical intent, not current reality, until they're updated.

## 1. Persistence and sync model

**Logseq**: a custom "CRDT-inspired" op-log sync (not Automerge/Yjs), layered on top of DataScript.
Local edits are tracked in a separate `client_ops` SQLite database for offline durability; remote transactions arrive over WebSocket and are applied via `apply-remote-txs!`, which rebases pending local transactions rather than doing a lattice merge.
Sync ("RTC") is a paid, invite-only, beta feature with per-graph end-to-end encryption; the server is closed-source, so "self-host" means pointing at your own instance of Logseq's binary, not an open protocol.
Exact conflict semantics (per-datom LWW vs. richer merge, the clock model) are undocumented in public sources.

**Canopy**: event log is the sole source of truth; the `Graph` is a rebuildable projection (`docs/architecture/decisions.md:77-81`, `docs/design/2026-07-03-event-log-storage-and-sync.md:10-16`).
CRDTs were adopted early (`@canopy/sync`, a Yjs `Y.Doc`), then deliberately deleted in favor of the event log — the design doc frames Yjs's residual role as "none, with a preserved re-entry point" for a future per-property text-merge strategy only (`...event-log-storage-and-sync.md:154-177`).
Convergence is achieved without a CRDT library via an explicit last-writer-wins element map over properties, additive/idempotent edges, and tombstones, guarded by a property-based convergence test.
Four storage adapters are implemented (in-memory, IndexedDB, SQLite, HTTP, file) — all built on the same two-method `EventLogStore` port (`packages/graph/src/event-log.ts:12-21`).
Deferred: persisted projection snapshots, log compaction, signing/E2EE, conflict-surfacing UX.

**Insight**: Logseq's experience is a real-world data point for Canopy's bet.
Logseq needed a custom rebase engine to get CRDT-like behavior and *still* has undocumented, apparently ad hoc conflict semantics; Canopy's simpler, fully-specified LWW-per-property model is easier to audit and test (there's already a property-based convergence test) at the cost of losing character-level merge.
This validates rather than challenges the `event-log-source-of-truth` decision — nothing here suggests reopening it.

## 2. Graph / data model

**Logseq**: DataScript (a Datalog/EAV triple-store fork) in memory, backed by SQLite (`sqlite3.wasm` in-browser, `better-sqlite3` on Node) via OPFS + WAL.
Pages and blocks are unified into one "node" concept, referenced uniformly with `[[ ]]` (the old `(( ))` block-ref syntax is gone).
Properties are typed (Text, Number, Date, DateTime, Checkbox, Node) and immutable-once-used in type.
Node *typing* is done via tags: a tag can carry "Tag Properties" that all nodes inherit, with parent-child inheritance through an `Extends` property — a lightweight, incrementally-adoptable alternative to a separate type registry.

**Canopy**: branded IDs, Zod schemas as the sole runtime-validation source of truth, and a genuinely meta-circular type system — the node that *defines* the node-type type has itself as its type (`packages/graph/src/system.ts:5,16`), and this same self-reference covers edge types, namespaces, property types, queries, views, templates, and renderers.
Node/edge typing goes through a formal `NodeTypeDefinition`/`EdgeTypeDefinition` node registry, not tag inheritance.

**Insight**: Logseq validates "everything is a node" at the content layer (pages=blocks=nodes); Canopy already goes further, applying it to the *type system itself* (types/queries/views are nodes too).
But Logseq's tag-as-class inheritance is a genuinely different, lighter-weight typing UX worth weighing against Canopy's more formal, heavier-to-author `NodeTypeDefinition` registry — relevant directly to the open `canopy-6cz` question (whether domain content types should live in per-domain namespaces).
Not a reason to change course, but worth citing as prior art when `canopy-6cz` is revisited.

## 3. Agent coordination and AI integration

**Logseq**: ships an official, native MCP server (Settings > AI > enable "MCP Server," HTTP transport on `127.0.0.1:12315/mcp`, bearer-token auth).
It exposes tools to create/list pages, tags, properties, and blocks; search nodes; and — notably — a **dry-run "pretend" mode** that previews change counts before applying, plus full undo/redo integration for AI-made edits.
There is no evidence of multi-agent orchestration built into Logseq itself; it is an MCP *tool provider*, with orchestration left to the external client (Claude, Gemini CLI, Cursor, LM Studio).

**Canopy**: agent coordination today is almost entirely process/tooling-level — beads issue tracking, OpenSpec's proposal→design→adversarial-review→tasks workflow, and Jules remote-agent sessions (`.jules/AGENTS.md`) — not live graph interaction.
The one graph-level agent-access surface is the CLI IPC transport from PR #404: a Unix-socket, NDJSON-framed, JSON-RPC 2.0 server (`packages/api-adapter/src/ipc/ipc-server.ts:96-322`) with a matching CLI client, supporting `getNode(s)`, `executeQuery`, `createNode`, `updateNodeProperties`, `deleteNode`, and event subscription.
Per the internal audit, this server is implemented and tested but **nothing currently hosts it** — the CLI's `daemon` command only exposes `status`; no shipped process calls `createIpcServer`.
There is no dry-run/preview mode for agent-issued mutations over this surface today, even though the kernel already has the primitive for one: `DraftSession` (`packages/graph/src/draft-session.ts:23-138`) is an overlay with optimistic-concurrency commit, built for plugin wizards but structurally identical to what Logseq's "pretend mode" needed.

**Insight (highest-value finding)**: two concrete, low-risk moves fall out of this comparison:
1. Wire up the already-implemented IPC server behind the CLI `daemon` command so agents can actually reach it — the gap is plumbing, not design.
2. Expose `DraftSession` over that IPC/agent surface as a dry-run mode for agent-issued mutations, mirroring Logseq's "pretend" + undo-integrated flow, using a primitive Canopy already built for a different purpose.
An MCP-protocol adapter alongside the existing GraphQL/Connect/IPC adapters in `@canopy/api-adapter` would let the same agents Logseq targets (Claude, Gemini CLI, etc.) address Canopy directly.

## 4. Plugin pipeline

**Logseq**: plugins run in-process inside an iframe sandbox (default, full isolation via `postMessage`/Postmate) or a lighter Shadow DOM mode (UI-only, shared window).
Plugins never touch SQLite directly — they reach the DB worker through the host, which talks to the worker via Comlink.
A coarse two-tier trust model is emerging: on web builds, only plugins with no "effect" (no side effects) are currently allowed; effect-plugins are being gradually opened to certified/trustworthy authors.
65+ plugins currently support DB graphs, surfaced via a marketplace compatibility filter; compatibility is still actively in flux.

**Canopy**: host-side WIT bindings, capability gating, and a real sandbox executor are implemented (`packages/api-adapter/src/wasm/`) — fuel metering (1M units default), a 16 MB memory quota, a 5s timeout, and per-call capability checks (`read:nodes`, `write:create-node`, etc.) in `sandboxed-executor.ts:12-153` and `host-bindings.ts:121-124`.
This is already more fine-grained than Logseq's binary effect/no-effect split.
The gap: `WasmGuestPlugin` is still typed as a plain JS function (`sandboxed-executor.ts:16`), not an instantiated WASM component.
The `wasm-component-pipeline` OpenSpec change (epic `canopy-5hw`) is closed with all tasks complete, but its scope was the guest-side build/packaging pipeline only (TS-to-ESM bundling, Brotli compression, multi-plugin discovery) — it never touched `sandboxed-executor.ts`.
Actually instantiating a real `.wasm` component on the host side is a distinct, still-open gap with **no beads or OpenSpec change tracking it** (`bd search "instantiat"` and `"component model"` both return nothing).
Invariant 10 (rendering resolved via graph-resident `RendererDefinition`/`ViewDefinition` nodes) is likewise aspirational — `apps/web`'s block renderer is still a hardcoded switch statement.

**Insight**: Canopy's plugin *security* design (per-call capabilities, resource metering) is already more rigorous than what Logseq has shipped.
But unlike the query engine's GQL gap, this one sits closer to being actionable — the build pipeline that would feed a real instantiation step already exists and is done; only the host-side wiring is missing, and it is currently untracked.

## 5. Query and access layer

**Logseq**: DataScript — a mature, indexed, in-memory Datalog engine with real query planning, doing double duty as both the query layer and the live application state store.

**Canopy**: the design target is an ISO GQL (ISO/IEC 39075, published April 2024) read layer, read-only by design — writes stay on the event system, reads execute only against the projected `Graph`, never the event log directly (`docs/design/2026-02-08-query-engine.md:41-50,118-135`).
Today, only the layer underneath that target is real: a typed pipeline IR (`node-scan | edge-scan | filter | traversal | sort | limit | project` steps, composed via curried combinators) and a naive in-memory executor — brute-force scans, no indexes, no planner (`packages/queries/src/engine.ts:24-126`).
GQL itself is unbuilt — `cypher.ts:19-55` is a placeholder that pattern-matches a single `MATCH (n:Type) RETURN n` shape and errors on anything else; the design doc lists the GQL parser strategy (from scratch, existing library, or a Cypher-first migration path) as an explicit open question, and defers indexing/push-down to future work.
The design doc itself is still marked `Status: draft` (`query-engine.md:3`), and unlike the plugin build pipeline above, it has never been staged into an OpenSpec change or a beads issue — `bd search` on `GQL`, `query engine`, `cypher`, and even bare `query` all return zero results.
So this gap is one step more dormant than the plugin one: not just unimplemented, but not yet queued as work at all.

**Insight**: this is the most concrete capability gap surfaced by the comparison.
Logseq's shipped, indexed Datalog engine is direct prior art for Canopy's own deferred indexing/planner work — worth consulting DataScript's design (or comparable Datalog engines) rather than hand-rolling an index/planner layer from scratch when that work is picked up.

## 6. Deep dive: does the event-log storage model accomplish our own stated goals?

The first five sections compare mechanisms; this section checks the persistence/sync decision against what Canopy itself said it was optimizing for, using Logseq as a stress test rather than a target to match.

### Our stated goals, verbatim

`docs/design/2026-07-03-event-log-storage-and-sync.md` is marked `Status: decided`, not draft — this is a closed decision, not an open design question.
Its own rationale (§6): "durability, auditability, and backend portability matter more" than intra-session live collaboration, character-level merge, or presence, which are explicitly named as accepted losses.
The target deployment is stated plainly: **single-user, multi-device, eventual sync** — not real-time multi-user collaboration.

This framing matters more than it looks: Logseq's RTC is explicitly built for real-time multi-*user* collaboration ("like Google Docs").
Canopy has no such goal.
A large fraction of what makes Logseq's sync engineering hard — the custom rebase protocol, the WebSocket relay, the full-graph-pull-on-conflict fallback — exists to solve a problem Canopy isn't trying to solve.
So "whose sync is better" is close to a category error; the fair question is whether Canopy's simpler model holds up for the goal it actually has.

### Mechanism comparison, same goal only

| Concern | Logseq DB | Canopy |
| --- | --- | --- |
| Local durability of pending writes | separate `client_ops` SQLite DB holding ops pending sync | the event log itself is the durable store — no separate pending-ops layer, because there's no separate materialized-state DB to keep authoritative |
| Conflict granularity | per-datom (≈ attribute-level), resolved by rebase | per-property (≈ same granularity), resolved by eventId-ordered LWW, no rebase step |
| Recoverability of a "losing" write | undocumented publicly — rebase implies the loser is transformed or dropped, no stated recoverability guarantee | explicit and implemented: the log is append-only, so a losing LWW write is never deleted, only shadowed in the projection, and is recoverable from history |
| Backend portability | state lives natively in SQLite tables + DataScript; no evidence of a portable abstraction over that pairing | `EventLogStore` port (`packages/graph/src/event-log.ts:12-21`) is genuinely backend-agnostic — 5 implementations (memory/IndexedDB/SQLite/HTTP/file) against the same 2-method port, none of them Canopy-specific glue |
| Query performance | DataScript is a real indexed Datalog engine — fast by construction | brute-force scan over an in-memory `Map` on every query call (`engine.ts:116-126`) — the direct cost of choosing durable-log-plus-naive-projection over a queryable materialized store |

### Verdict

The durability, auditability, and backend-portability goals are met, not just claimed — the convergence invariant has a property-based test, and the 5-backend port is real, working code, not an aspiration.
Logseq's own experience is corroborating evidence for the CRDT-avoidance call: they needed a bespoke, still partly-undocumented rebase engine to get equivalent-granularity conflict resolution, which is real complexity Canopy's simpler model sidesteps by not sharing Logseq's real-time-collaboration goal.

Two risks worth naming plainly rather than waving away:

1. **Query performance under agentic load is unvalidated.** The design doc's justification for skipping a persisted projection snapshot is that "replaying a personal vault's log (thousands of events) through `projectGraph` is milliseconds-scale" — that's replay cost, not the cost of repeatedly scanning the resulting `Map` on every subsequent query.
   Canopy's own stated goal includes "AI and agentic workflows query the graph programmatically" (`query-engine.md:20`) — a workload pattern of many small queries per turn, which is exactly where O(n) brute-force scans start to hurt, unlike the one-big-query-per-page-load pattern a human UI produces.
   No benchmark, bead, or doc gives a number for vault size or query volume where this becomes a problem.
   This isn't evidence the architecture is wrong; it's evidence the boundary of the architecture hasn't been measured.
2. **Signing/E2EE is deferred (own doc, §9), but the threat exists today, not just for a hypothetical multi-user future.** Even single-user Drive-folder sync means vault content transits and rests on a third party's servers in plaintext under the current file-transport design (§5).
   Logseq baking per-graph E2EE into RTC from the start (admittedly for a different, multi-user threat model) is a signal that this isn't purely a "someday" item once any real file-based sync backend is turned on for a real user.

Net: the decision is rock solid for the goal it was actually made for.
It was never trying to be Logseq's RTC, and holding it to that bar would be the wrong comparison.
The honest gap is that "will it hold up" has an unmeasured dimension (query load) and a deferred-but-live threat (plaintext sync) — not that the wrong architecture was chosen.

## 7. Deep dive: plugin/extension model — design rigor vs Logseq's shipped ecosystem

### Our stated goals

`docs/design/2026-02-08-extension-and-execution-model.md` (`Status: draft — conceptual, not implementation-ready`) wants: WASM sandboxing so extensions can be written in any language, capability-based least privilege, extensions represented as graph nodes, and one uniform permission model across humans, AI agents, and extensions (§1, §4).
`docs/design/2026-07-16-wasm-plugin-lifecycle-and-wizard.md` is the one part of this space with a real adversarial-review pass, but its scope is narrower — multi-step data-entry wizards specifically, not the general extension model.

### What's actually true today, verified against source

- **Language-agnostic WASM is architecturally possible but practically unproven.** The only build pipeline that exists (`canopy-5hw`, closed/complete) compiles guest plugins from **TypeScript only** — "any language that compiles to WASM" has never been exercised.
- **The wizard doc's XSS mitigation is real and doesn't generalize.** Its adversarial review states plugins "cannot return raw HTML or JS strings" — the host renders forms natively from declarative schemas, closing off a whole vulnerability class Logseq's JS-sandbox model cannot structurally close off (Logseq's plugins are arbitrary JS in an isolated iframe/Shadow DOM; isolation limits blast radius but does not prevent the plugin from generating and returning arbitrary markup within its own boundary).
  But this mitigation is scoped to wizards, which are inherently form-based.
  The conceptual extension model's `canopy:ui/render` interface (`extension-and-execution-model.md:63`) is explicitly designed to "Return HTML output to the viewport" for custom renderers — precisely the pattern the wizard doc's mitigation exists to avoid — and that document has no adversarial review section at all (it is still draft/conceptual).
  **This is an unresolved internal tension between Canopy's own two plugin design docs**, not a Logseq-comparison finding: the one plugin type that's been security-reviewed is also the one type structurally incapable of the HTML-injection risk; the type that will need to return HTML hasn't been reviewed to the same standard.
- **The policy model in the design doc and the capability model in the code are two disconnected systems.** The design doc's intent is a policy "attached to its node in the graph" (`extension-and-execution-model.md:85`).
  What's implemented (`packages/api-adapter/src/wasm/capabilities.ts:6-19,31-50`) is a flat bearer-token scope string (e.g. `read:nodes write:create-node`, wildcard-capable), checked at call time, structurally identical to generic API-adapter auth — nothing graph-resident or per-extension about it.
  The plugin manifest schema does declare a `capabilities: string[]` field, and `packages/graph/src/plugin-validation.ts:181-200` validates that it's shaped correctly — but grep confirms nothing reads that manifest-declared list and feeds it into `verifyCapability`/`WasmCapability`.
  They are two capability systems that don't talk to each other yet.
- **Distribution/discovery is explicitly out of scope** (`extension-and-execution-model.md:163`, "Extension marketplace or registry — Future consideration") — a deliberate, reasonable deferral for a system with no user-provided extensions yet (§1), but real distance from Logseq's working marketplace with compatibility filtering across 65+ plugins.

### Verdict

Individually, Canopy's plugin *security primitives* — fuel/memory/timeout metering, capability-token checks, and the wizard's no-raw-HTML constraint — are more rigorous than anything Logseq ships today, which relies on iframe/Shadow-DOM isolation plus a coarse effect/no-effect trust tier.
But it would be premature to call the plugin *architecture* rock solid as a whole: the rigor that exists is real but narrow (wizards only), the manifest-declared and runtime-enforced capability systems don't connect, and the one extension type that structurally needs to return HTML to a viewport (renderers) hasn't had an adversarial pass at all.
Before renderer-type extensions get built, they need their own security review — the wizard doc's mitigations do not automatically transfer.

## Design insights for Canopy evolution

1. **Wire up the IPC daemon** — the agent-facing query/mutation server exists and is tested but nothing hosts it yet; this is the single highest-leverage, lowest-risk gap found.
2. **Expose `DraftSession` as an agent dry-run mode** over that IPC surface, mirroring Logseq's "pretend mode" — Canopy already has the primitive.
3. **Consider an MCP adapter** alongside the existing GraphQL/Connect/IPC adapters in `@canopy/api-adapter`, to reach the same MCP-capable agent clients (Claude, Gemini CLI, etc.) Logseq now targets natively.
4. **Treat DataScript as prior art** when Canopy's query engine indexing/planner work is eventually staged — don't design that from a blank page.
5. **No case for reopening the CRDT decision** — Logseq's need for a custom, partially-undocumented rebase protocol reinforces that Canopy's simpler, fully-specified event-log LWW model was the right trade for a pre-1.0, single-maintainer project.
6. **Tag-based typing is relevant prior art for `canopy-6cz`** (per-domain namespace question) — Logseq's lightweight tag-inheritance typing is a different point in the design space from Canopy's formal `NodeTypeDefinition` registry, worth citing when that question is revisited, not adopting wholesale.
7. **Query performance under agentic load, now measured (`canopy-c54`)**: no algorithmic cliff, just linear scan cost — flat filters stay cheap to 50k nodes (3.8ms), but traversal and sort+limit bend around **~10k nodes** and reach 20–30ms/call by 50k. Per-call overhead doesn't compound, but a 50-query agent turn scales straight with graph size and crosses ~100ms around 25–30k nodes. Gives the deferred indexing/planner work a real trigger point instead of a vague "someday."
8. **Reconcile the two plugin design docs' HTML-output security posture before building renderer extensions (`canopy-7dj`)** — recommended direction: declarative-first rendering by default (mirroring the wizard doc's own no-raw-HTML precedent), with raw HTML gated behind an explicit `render:raw-html` capability routed through a sandboxed iframe + strict CSP, never inline — following the pattern VS Code, Obsidian, and Figma each converge on for untrusted plugin output.
9. **Wire the plugin manifest's declared `capabilities` into the runtime `WasmCapability` check (`canopy-dr4`)** — recommended mechanism: mint a scoped capability token at plugin *load* time from `manifest.capabilities ∩ context-grantable-capabilities`, bound into the host bindings at instantiation rather than threaded per call — the same load-time-attenuation pattern Chrome and the WASM Component Model/WASI use.

## Open questions not resolved by this research

- Logseq's exact CRDT/conflict semantics and on-disk SQLite schema are undocumented publicly; not worth pursuing further unless Canopy revisits its own sync model.
- Whether Logseq's RTC sync has reached general availability past the 2026-04-28 doc snapshot is unconfirmed and not relevant to Canopy's roadmap.

## Sources

**Logseq**: `github.com/logseq/docs` (`db-version.md`, `db-version-changes.md`, 2026-04-28), `deepwiki.com/logseq/logseq` (source-grounded wiki, commit `3de7c751`), `discuss.logseq.com` (forum threads on sync open-sourcing and DB plugin compatibility).

**Canopy**: `AGENTS.md`, `docs/architecture/decisions.md`, `docs/design/2026-07-03-event-log-storage-and-sync.md`, `docs/design/2026-02-08-query-engine.md`, `docs/design/2026-02-08-extension-and-execution-model.md`, `docs/design/2026-07-16-wasm-plugin-lifecycle-and-wizard.md`, `.jules/AGENTS.md`, and the `packages/graph`, `packages/queries`, `packages/api-adapter`, `apps/cli` source trees.
