## Context

Architectural invariant #1 in `AGENTS.md` says `@canopy/graph` is the leaf — no `@canopy/*` imports.
The bounded-context diagram in `docs/architecture/bounded-contexts.md` is a hand-maintained mermaid graph.
Neither is machine-checked, so both drifted: the `canopy-jxw` review recorded F1 (diagram omitted real edges) and F2 (a dev-only `graph -> storage-sqlite -> graph` cycle via `packages/graph/tests/history.test.ts`).
F2 was fixed in PR #489 (the SQLite-backed test adapter was replaced by a local in-memory `EventLogStore` stub and the `@canopy/storage-sqlite` devDependency removed from `packages/graph/package.json`).
F1 was mostly fixed by `canopy-1s7`.

The lint chain today is:
`bun tools/check-commands.ts && check:versions && check:api-compatibility && check:unused && bun tools/lint-workspaces.ts && check:eslint-disable-ceiling`.
Each step is a small typed Bun script; this change adds one more in that mold.

**Dry-run against `main` (this change's investigation).**
A throwaway prototype implementing all three assertions was run against the current tree.
It derives edges from git-tracked `packages/*` and `apps/*` manifests (14 workspaces; the repo-root `canopy-graph` and `@canopy/tools` have zero internal edges and are not product workspaces).
Results:

- **Leaf check: clean.** `@canopy/graph` has zero `@canopy/*` `dependencies` and zero `@canopy/*` `devDependencies`. F2 is confirmed fixed at the manifest level.
- **Acyclicity (union of runtime + dev edges): clean.** The three dev-only internal edges present today — `@canopy/api-adapter ~> @canopy/storage`, `@canopy/queries ~> @canopy/storage`, `@canopy/clip-host ~> @canopy/storage` (all `devDependencies`) — each terminate at `storage -> graph -> ∅` and form no cycle.
- **Documentation parity (runtime edges vs mermaid): one drift.** 24 real runtime `@canopy/*` edges vs 23 documented mermaid edges. The single difference is `@canopy/web -> @canopy/api-adapter`: `apps/web` depends on `@canopy/api-adapter` at runtime, but the mermaid has no `web --> apiAdapter` edge. `canopy-1s7` added the `storage-file`/`storage-http` nodes and edges but missed this one. Node-set parity is otherwise clean (every product workspace has a mermaid node, including `apps/extension` with zero outgoing edges).

So the dry-run is **not** zero violations, contrary to the bead's acceptance wording (written when F1/F2 were both broken).
It is one live documentation drift the guard would immediately catch.
This is the measure-before-gating result: the implementation step must add `web --> apiAdapter` to the mermaid first, then wire the guard, so the check lands green while having proven it earns its keep on day one.

## Goals / Non-Goals

**Goals:**

- Enforce the kernel-leaf invariant over both `dependencies` and `devDependencies`.
- Detect cycles in the internal graph formed by the union of runtime and dev edges.
- Assert the mermaid diagram equals the real runtime dependency graph (edges and nodes).
- Make derivation deterministic and reproducible (git-tracked manifests, one canonical parse), consistent with the existing `tools/*.ts` check style.
- Ground the design in an actual dry-run, not the stale acceptance wording.

**Non-Goals:**

- Enforcing _import_-level layering (no deep-import or actual `import` graph analysis) — this guard operates on declared manifest edges, which is where invariant #1 and the diagram both live. Import-level enforcement is a separate concern.
- Auto-editing `docs/architecture/bounded-contexts.md` — the guard reports drift; a human (or the implementation step) edits the diagram.
- Governing non-product workspaces (repo root, `tools`) or non-`@canopy/*` third-party dependencies.
- Replacing `knip` (`check:unused`) — that finds unused deps; this finds structural/graph and doc-parity violations, an orthogonal axis.

## Decisions

### Decision 1: One typed script wired into `bun run lint`, not a new eslint rule or CI-only job

Add `tools/check-dependency-graph.ts` and append `&& bun tools/check-dependency-graph.ts` (via a `check:dependency-graph` script) to the `lint` chain.

- **Why**: mirrors `check-eslint-disable-ceiling.ts` and `check-api-compatibility.ts` — small, dependency-free (Node/Bun built-ins), runs locally and in CI through the same `bun run lint` entry point, no eslint-plugin authoring cost.
- **Alternative — a custom eslint rule / `eslint-plugin-boundaries`**: rejected. Those operate on `import` statements per file, needing a TypeScript program and per-package config; the invariant and the diagram are both expressed as _manifest_ edges, so a manifest-level check is a closer, cheaper fit and needs no new dependency.
- **Alternative — CI-only workflow step**: rejected; it would not run in the local `bun run lint` contributors already use, breaking the single-entry-point convention.

### Decision 2: Leaf and cycle checks use `dependencies ∪ devDependencies`; the doc-parity check uses `dependencies` only

This asymmetry is the crux of the design and is deliberate.

- **Leaf (criterion 1)** must include `devDependencies`: F2 was a _dev-only_ edge (`graph`'s test importing `storage-sqlite`). A runtime-only leaf check would have missed it entirely. So the kernel must have zero internal deps of _either_ kind.
- **Cycle (criterion 2)** must include `devDependencies`: a test-time edge can close a cycle just as a runtime edge can (exactly the F2 shape). Building the cycle graph from the union catches dev-induced cycles that a runtime-only graph would not.
- **Doc-parity (criterion 3)** must exclude `devDependencies`: the mermaid documents _runtime topology_. Today three dev-only edges (`api-adapter`, `queries`, `clip-host` each `~> storage`) are intentionally absent from the diagram — they are test wiring, not architecture. Comparing the diagram against `deps ∪ devDeps` would raise three false "drift" failures. Comparing against `dependencies` only makes the one real drift (`web -> api-adapter`) the sole finding, matching the diagram's documented semantics ("real runtime edges", per the bead).

The script therefore derives two edge sets from the same manifests: a `runtimeEdges` set (from `dependencies`) and an `allEdges` set (union). Leaf and cycle consume `allEdges`; doc-parity consumes `runtimeEdges`.

### Decision 3: Robust mermaid parsing — scope to the labelled block, resolve nodes by name-or-path

The parser:

1. Slices the fenced ` ```mermaid ` block that follows the `## Dependency graph` heading (not any mermaid block elsewhere in the doc, now or later).
2. Reads node declarations `id[label]` into an `id -> label` map.
3. Reads edges matching `^\s*(\w+)\s*-->\s*(\w+)\s*$` and translates endpoint ids to labels.
4. **Resolves each label to a canonical workspace** by two-key lookup: match the label against each workspace's manifest `name` _or_ its repo-relative directory. Packages are labelled `@canopy/graph` (a name); apps are labelled `apps/web` (a path). Both resolve to the same workspace identity (`@canopy/web`), so the edge comparison is done in one canonical namespace and is immune to label-style differences.

- **Why parse the existing mermaid rather than move the graph to a data file**: the diagram is the artifact humans read and the thing that drifted; checking _it_ directly is what closes F1. A separate machine-readable file would just move the drift surface.
- **Why the name-or-path resolver**: without it, `apps/web` (label) would never match `@canopy/web` (manifest name) and every app edge would look like drift. Making the resolver explicit is more robust than requiring the diagram to switch all labels to `@canopy/*` names (which would be a larger, unrelated doc edit).
- **Robustness posture**: the parser tolerates `graph TD`, blank lines, comments, and node-only lines; it ignores edge _labels_ (`-->|text|`) shape by matching the plain `-->` form (none exist today; if one is added the parser is extended alongside).

### Decision 4: Report all findings, exit non-zero on any; self-describing remedies

The script accumulates violations across all three criteria and prints each with a concrete remedy (add/remove a manifest dep, break the cycle, or edit the specific mermaid edge/node), then exits 1 if any exist — rather than failing fast on the first.
This mirrors the ergonomics of the existing checks (a contributor sees the whole delta in one run).

- **Alternative — fail fast**: rejected; a contributor fixing one edge would rerun to discover the next, slower feedback.

### Decision 5: Derive nodes from git-tracked `packages/*` and `apps/*` manifests only

Workspace discovery uses `git ls-files -- 'packages/*/package.json' 'apps/*/package.json'` (tracked files only, consistent with `check-eslint-disable-ceiling.ts`), excluding the repo-root meta-package and `tools`.

- **Why**: those two have zero internal edges and are build tooling, not bounded contexts; the diagram does not (and should not) document them. Scoping node-set parity to product workspaces avoids spurious "undocumented node" failures for tooling.
- **Why git-tracked**: an untracked scratch `package.json` under `packages/` cannot perturb the derived graph, keeping the check deterministic across dirty trees.

## Risks / Trade-offs

- **Diagram uses a mermaid construct the parser does not model** (edge labels, subgraphs, `&` chained edges) → the current diagram uses only `id[label]` decls and plain `a --> b` edges; the parser targets exactly that grammar and fails loudly (not silently) on an unrecognized edge line. If the diagram grows richer constructs, the parser is extended in the same PR that adds them. A fixture test (Decision below) pins the parse.
- **Name-or-path resolver ambiguity** (a label matching two workspaces) → package `name`s are unique and directory paths are unique, and the two keyspaces do not overlap (`@canopy/*` vs `apps/*`/`packages/*`), so resolution is unambiguous; the script errors if a label resolves to zero or multiple workspaces rather than guessing.
- **Doc-parity excludes devDeps, so a dev-only edge that _should_ be documented stays invisible** → accepted by design: the diagram is runtime topology and dev edges are test wiring. If a dev edge ever becomes architecturally meaningful it should be promoted to a runtime dep (and then it is checked). The leaf and cycle checks still see all dev edges, so the dangerous cases (kernel contamination, cycles) are covered.
- **New package added without a mermaid node** → the node-set parity assertion fails with the missing node named; this is the intended catch, not a risk, but it means adding a package now requires a one-line diagram edit (documented in the failure message).
- **False sense of safety** (manifest edges ≠ actual `import`s) → out of scope and stated as a Non-Goal; a package could declare a dep it does not import (caught by `knip`) or, more worryingly, deep-import without declaring (not caught here). This guard raises the floor (declared topology and the diagram are now enforced) without claiming to be import-level layering enforcement.

## Migration Plan

1. Implementation step (separately approved): add the missing `web --> apiAdapter` edge to `docs/architecture/bounded-contexts.md` so runtime edges and the diagram agree.
2. Add `tools/check-dependency-graph.ts` plus a small fixture unit test pinning the mermaid parse and the three assertions on a synthetic graph.
3. Add a `check:dependency-graph` script and append it to the `lint` chain.
4. Confirm `bun run lint` is green end-to-end (leaf clean, acyclic, doc-parity clean after step 1).
5. Rollback = revert the script, the `lint`-chain edit, and the one diagram line. No data, API, or runtime surface is touched.

## Adversarial review and mitigations

**Resource / performance overhead.**
The guard reads ~14 small `package.json` files and one markdown file, runs a linear DFS over ≤14 nodes, and does set differences over ~24 edges — microseconds of work, single-digit-millisecond process startup.
It loads no TypeScript program (unlike the eslint passes it sits beside) and adds no dependency (Node/Bun built-ins only), so its CI cost is negligible against the existing per-workspace eslint programs.
It runs once per `bun run lint`, not per workspace.

**Edge cases / failure modes.**

- _Dev-only cycle (the F2 shape)_: covered — the cycle graph is built from `deps ∪ devDeps`, so a test-time back-edge into the kernel is detected; a runtime-only graph would miss it.
- _Kernel dev contamination_: the leaf check inspects `devDependencies` explicitly, so re-adding a `@canopy/storage-sqlite` test dep to `packages/graph` fails immediately.
- _Label-style mismatch_: apps labelled by path vs named by manifest is resolved by the name-or-path resolver; a fixture test covers both forms.
- _Unrecognized mermaid line_: the parser fails loudly rather than silently dropping an edge, so a diagram construct it does not model cannot cause a false pass.
- _Diamond / shared dependencies_: DFS with an on-stack marker reports genuine cycles only; a diamond (two paths to `graph`) is not a cycle and does not false-positive.
- _Dirty working tree_: git-tracked-only discovery means untracked scratch manifests cannot perturb results.
- _Self-loop or duplicate edge in a manifest_: a self internal-dependency is impossible for a valid manifest, and duplicate declarations collapse in the edge `Set`; neither destabilizes the check.

**Security / isolation.**
Dev-tooling only; no runtime, network, or data-plane surface, no privileged execution, no new third-party dependency.
The script only reads files and runs `git ls-files`.
There is no baseline integer to game (unlike the eslint ceiling): the assertions are exact-equality/structural, so weakening the guard requires visibly editing the diagram or a manifest, reviewed like any change.

**Migration / backward compatibility.**
No artifact is consumed by anything else, so there is no compatibility surface to break.
The only pre-existing state touched is one added mermaid edge (`web --> apiAdapter`), which corrects the diagram toward reality.
Rollback is a clean revert of the script, the lint-chain line, and that one diagram line.
Pre-release status means no user data or vault is affected.
The sole downstream is contributor workflow: a new, self-describing lint failure whose message names the exact edge/cycle/node to fix.

## Open Questions

- Should the doc-parity check eventually also assert the mermaid's declared _node labels_ use a single convention (all `@canopy/*` names, or all paths), rather than the current mix? The name-or-path resolver makes this cosmetic today; a follow-up could normalize the diagram, but that is a separate doc change, not part of enforcing parity.
- Should a future iteration add declared-vs-actual _import_ checking (deep-import detection) to close the "declares a dep it does not import, or imports without declaring" gap? That is a larger effort (needs a TS program) and is explicitly a Non-Goal here; file a follow-up bead if the risk materializes.
