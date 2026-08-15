# Package graph & bounded-contexts review

Track `canopy-jxw` of the whole-system review epic `canopy-v9o`.
Review/decision work only — each real change below still needs its own OpenSpec change + adversarial review before implementation.

## Scope

Audit the 9-package + 5-app split and the `@canopy/*` dependency graph against `docs/architecture/bounded-contexts.md`.
Check the leaf-kernel invariant, cross-package duplication, cycles, and whether any package has drifted into a generic bucket.
Produce a durable guard so the class of drift found here cannot silently return.

## Method

Derived the real dependency graph from every workspace `package.json` (`dependencies` and `devDependencies`, `@canopy/*` only), then compared it against the documented mermaid graph and the stated invariants.
Verified each reverse/dev edge for cycles and each import against actual source usage.

## Actual dependency graph (from package.json)

Runtime `dependencies`:

| package                     | @canopy deps                                                      |
| :-------------------------- | :---------------------------------------------------------------- |
| `@canopy/graph`             | — (leaf)                                                          |
| `@canopy/queries`           | graph                                                             |
| `@canopy/settings`          | graph                                                             |
| `@canopy/storage`           | graph                                                             |
| `@canopy/storage-indexeddb` | graph                                                             |
| `@canopy/storage-sqlite`    | graph                                                             |
| `@canopy/storage-file`      | graph                                                             |
| `@canopy/storage-http`      | graph                                                             |
| `@canopy/api-adapter`       | graph, queries                                                    |
| `apps/cli`                  | api-adapter, graph, storage                                       |
| `apps/clip-host`            | api-adapter, graph                                                |
| `apps/daemon`               | api-adapter, graph, storage, storage-sqlite                       |
| `apps/extension`            | — (zero-dep, native-messaging only)                               |
| `apps/web`                  | api-adapter, graph, queries, settings, storage, storage-indexeddb |

Test-only `devDependencies` (`@canopy/*`):

- `@canopy/graph` → `@canopy/storage-sqlite`
- `@canopy/queries` → `@canopy/storage`
- `@canopy/api-adapter` → `@canopy/storage`
- `apps/clip-host` → `@canopy/storage`

## Findings

### F1 — doc/graph drift, and no structural guard prevents it (major)

`apps/web` depends on `@canopy/api-adapter` at runtime and imports it in seven source files (Tier-2 render worker, capability intersection, `createApiAdapterContext`, `WasmHostBindings`).
The mermaid graph in `bounded-contexts.md` has no `web --> apiAdapter` edge.
The doc was refreshed for storage-file/http/api-adapter but still drifted on this edge, because nothing checks the documented graph against reality.
Every documented invariant here (leaf, allowed imports, the edge list) is prose that no automation enforces.

Route the edge fix through the existing `canopy-1s7` (refresh `bounded-contexts.md`); the durable fix is the guard in C1.

### F2 — the "leaf" reaches back into a dependent, forming a dev/test cycle (major)

Invariant #1 (AGENTS.md) and `bounded-contexts.md` line 54 state `@canopy/graph` is the leaf with no internal dependencies.
`packages/graph/package.json` carries a `devDependency` on `@canopy/storage-sqlite`, used by `packages/graph/tests/history.test.ts` (`createSQLiteEventLog`).
Because `@canopy/storage-sqlite` depends on `@canopy/graph`, this is a real `graph ↔ storage-sqlite` cycle at the dev/test level — the leaf is no longer a leaf for its own test build.
`@canopy/graph` already defines the `EventLogStore` port, so the history test can exercise `getGraphAt` against a ~15-line in-memory array-backed `EventLogStore` stub with no concrete adapter and no cross-package edge.
The other three test devDeps (`queries`, `api-adapter`, `clip-host` → `storage`) are one-directional and do **not** form cycles; only the `graph` one does, precisely because `graph` is supposed to be the leaf.

Fix bead filed: replace the concrete SQLite store in `history.test.ts` with an in-memory port stub and drop the devDep.

### F3 — `@canopy/api-adapter` is drifting into a bucket (major)

The package is 34 source files spanning four independent transport stacks — Connect/gRPC (`connect/`), GraphQL (`graphql/`), JSON-RPC-over-Unix-socket IPC (`ipc/`), and REST payloads (`api-payloads.ts`) — **plus** the entire WASM plugin host (`wasm/`: `capabilities`, `host-bindings`, `sandboxed-executor`, `terminable-execution`, `wit-spec`, `wasm-adapter`).
`api` is one of the three names the project explicitly bans as a generic catch-all (`bounded-contexts.md` line 5), and the scope note ("the transport and protocol adapter layer") describes a layer, not a bounded concept.
The WASM/plugin host is the clearest misfit: executing untrusted plugin components, marshaling host imports, and enforcing capabilities is a **plugin-execution** concern, not an API-transport one — it sits in `api-adapter` only because `apps/web` needed to import it and there was no plugin-host package.
This is also the structural root of F4: the capability vocabulary lives in `api-adapter/src/wasm/` and is duplicated into `graph` (canopy-3xr) because the leaf cannot import the "api" package.
A `@canopy/plugin-host` (or `@canopy/wasm-host`) extraction would give the capability vocabulary a proper home, shrink `api-adapter` to genuine transport adapters, and let `apps/web` depend on the plugin host without pulling in gRPC/GraphQL server code.

Needs its own design + OpenSpec + adversarial review — filed as a design bead, related to `canopy-3xr` and `canopy-reh`.

### F4 — WASM capability vocabulary duplicated across `graph` and `api-adapter` (medium, known)

`RECOGNIZED_WASM_CAPABILITIES` in `packages/graph/src/plugin-validation.ts` duplicates `KNOWN_WASM_CAPABILITIES` in `packages/api-adapter/src/wasm/capabilities.ts`, because the leaf cannot import `api-adapter`.
Tracked as `canopy-3xr`; an interim drift guard already exists (`api-adapter/tests/wasm-capability-vocabulary-sync.test.ts`, PR #458) that fails CI if the two sets diverge.
The single-source/WIT-derived design is still pending and needs OpenSpec + adversarial review.
No new bead — recorded here as the concrete cross-package duplication for this track, and noted that F3's plugin-host extraction changes where the single source should live.

### F5 — documented import rules contradict test practice (minor)

`bounded-contexts.md` line 120 says "do not import the package's own public name," but graph's own tests import `@canopy/graph` (the barrel) 32 times, deliberately, to test through the public API.
The same section (line 118) says a package may only import from its `package.json` `dependencies`, which omits `devDependencies` — the actual (and legitimate) source of every test-only cross-package import above.
Clarify the rule: production `src` imports only from `dependencies` and never the own package name; test files may import the own barrel and `devDependencies`.
This is a doc-only codification — route through `canopy-egu`/`canopy-1s7`.

### F6 — storage split is clean; no bucket there (context)

The five `EventLogStore` implementations (`storage` in-memory, `storage-indexeddb`, `storage-sqlite`, `storage-file`, `storage-http`) each own one concrete backend with real domain scope and depend only on the leaf.
`storage`'s dual role (port re-export + dependency-free in-memory impl) is justified — it lets port-only consumers stay dependency-free.
No action; recorded so the split is not "fixed" by future consolidation without cause.

## Codification (the durable guard)

### C1 — `tools/check-dependency-graph.ts`, wired into `bun run lint`

A single automation that derives the real `@canopy/*` graph from every workspace `package.json` and asserts:

1. **Leaf invariant** — `@canopy/graph` has zero `@canopy/*` entries in `dependencies` **and** `devDependencies` (catches F2 directly).
2. **No cycles** — including `devDependencies` in the graph (the only way F2's cycle is visible).
3. **Doc/graph consistency** — parse the mermaid edge list in `bounded-contexts.md` and assert it equals the set of real runtime edges (catches F1, and every future drift).

This is a CI-gating automation, so per `feedback_measure_before_gating_ci_checks` it must be dry-run against current `main` first (it should report exactly F1 + F2 and nothing else) before it is wired to fail.
It is a real change → filed as a codification bead needing OpenSpec + adversarial review, not implemented in this review.

## Bead summary

- Fix: F2 leaf cycle — swap SQLite store for in-memory port stub in `graph` history test, drop devDep.
- Route: F1 edge (`web → api-adapter`) into existing `canopy-1s7` doc refresh.
- Design: F3 extract `@canopy/plugin-host` from `api-adapter` (OpenSpec + adversarial review; relates to `canopy-3xr`, `canopy-reh`).
- Codify: C1 dependency-graph guard tool (OpenSpec + adversarial review; measure before gating).
- Codify: F5 doc-rule clarification (doc-only; via `canopy-egu`/`canopy-1s7`).
- Cross-ref: F4 capability duplication stays on `canopy-3xr`; F6 storage split is intentionally left alone.
