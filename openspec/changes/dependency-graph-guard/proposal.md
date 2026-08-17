## Why

Architectural invariant #1 (`@canopy/graph` is the leaf) and the hand-maintained dependency diagram in `docs/architecture/bounded-contexts.md` have no automated enforcement.
The `canopy-jxw` review found two drifts that had accumulated silently: F1 — the mermaid diagram omitted real runtime edges (`@canopy/storage-file`/`@canopy/storage-http` nodes and `web -> api-adapter`); F2 — `packages/graph` had a dev-only cycle because its history test depended on `@canopy/storage-sqlite`, which depends back on `@canopy/graph`.
F2 was fixed in PR #489 and most of F1 in `canopy-1s7`, but nothing stops the next drift.
A dry-run of the proposed guard against current `main` (see design Context) confirms this is not hypothetical: it still finds one live documentation drift (`@canopy/web -> @canopy/api-adapter` is a real runtime dependency missing from the mermaid) that `canopy-1s7` did not catch.

## What Changes

- Add `tools/check-dependency-graph.ts`, wired into `bun run lint`, that derives the real `@canopy/*` dependency graph from every workspace `package.json` (`dependencies` and `devDependencies`) and asserts three properties.
- **Leaf**: `@canopy/graph` has zero `@canopy/*` `dependencies` and zero `@canopy/*` `devDependencies`.
- **Acyclicity**: the graph formed by the union of runtime and dev internal edges contains no cycle — closing F2's dev-only-cycle failure mode, not just runtime cycles.
- **Documentation parity**: the mermaid edges in `docs/architecture/bounded-contexts.md` equal the real runtime (`dependencies`-only) edges, and every `packages/*`/`apps/*` workspace has a node — closing F1 structurally instead of fixing the diagram once.
- Per `feedback_measure_before_gating_ci_checks`: the guard was dry-run against `main` before this proposal; the design records exactly what it found (leaf clean, acyclic, one documentation drift) so the check is not wired blind.
- The implementation (a later, separately-approved step) will add the missing `web -> api-adapter` mermaid edge so the guard lands green, then wire it into the lint chain.

## Capabilities

### New Capabilities

- `dependency-graph-guard`: a lint-wired check that derives the internal package graph from workspace manifests and enforces the kernel-leaf invariant, acyclicity (including dev edges), and documentation parity with `docs/architecture/bounded-contexts.md`.

### Modified Capabilities

<!-- None. The guard enforces existing invariant #1 and the existing dependency-graph doc; it does not change the package topology or any package's public API. -->

## Impact

- `tools/check-dependency-graph.ts` — new typed check script, style-consistent with `tools/check-eslint-disable-ceiling.ts` and `tools/check-api-compatibility.ts`.
- `package.json` `lint` script — one new step appended to the chain.
- `docs/architecture/bounded-contexts.md` — the mermaid gains the missing `web -> api-adapter` edge (the guard's parity assertion requires it to be green on merge).
- Contributors and CI: a new failure mode when a manifest edge and the diagram disagree, when a cycle is introduced, or when the kernel gains an internal dependency — each with a self-describing remedy.
- No runtime, data, or public-API surface is touched; pre-release status means no user impact.
