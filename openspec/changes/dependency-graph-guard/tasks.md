## 1. Fix the known documentation drift (measure-before-gating prerequisite)

- [ ] 1.1 Add the missing `web --> apiAdapter` edge to the mermaid block in `docs/architecture/bounded-contexts.md` (`apps/web` has a real runtime `@canopy/api-adapter` dependency not currently documented)
- [ ] 1.2 Re-check by hand that the mermaid edges now equal the real runtime `@canopy/*` edges across every `packages/*`/`apps/*` workspace, so the guard lands green on first wire-up

## 2. Build `tools/check-dependency-graph.ts`

- [ ] 2.1 Workspace discovery: `git ls-files -- 'packages/*/package.json' 'apps/*/package.json'`, parse each manifest's `name`, `dependencies`, `devDependencies`
- [ ] 2.2 Derive two internal `@canopy/*` edge sets per workspace: `runtimeEdges` (from `dependencies` only) and `allEdges` (union of `dependencies` + `devDependencies`)
- [ ] 2.3 Leaf check: fail if `@canopy/graph` has any `@canopy/*` entry in `allEdges`; name each offending dependency and whether it's a `dependencies` or `devDependencies` entry
- [ ] 2.4 Cycle check: DFS over `allEdges` with an on-stack marker; fail and report the full cycle path if one exists
- [ ] 2.5 Mermaid parser: slice the fenced ` ```mermaid ` block under the `## Dependency graph` heading in `docs/architecture/bounded-contexts.md`; parse `id[label]` node declarations and `a --> b` edges; fail loudly (not silently) on an edge/node line the parser does not recognize
- [ ] 2.6 Name-or-path resolver: resolve each mermaid label to a workspace by matching against the manifest `name` (e.g. `@canopy/graph`) or the workspace's repo-relative directory (e.g. `apps/web`), so packages and apps are both handled in one canonical namespace
- [ ] 2.7 Documentation-parity check: compare `runtimeEdges` (not `allEdges`) against the parsed mermaid edges; fail on any undocumented runtime edge, any stale documented edge with no matching runtime dependency, or any `packages/*`/`apps/*` workspace missing a mermaid node
- [ ] 2.8 Accumulate violations across all three checks (leaf, cycle, doc-parity) and print each with a concrete remedy; exit 1 if any exist, exit 0 otherwise — don't fail fast on the first violation

## 3. Test

- [ ] 3.1 Add a fixture unit test pinning the mermaid parser and all three assertions against a small synthetic graph, covering: a clean pass, a leaf violation (runtime and dev-only), a dev-only-edge cycle (the F2 shape), an undocumented runtime edge, a stale documented edge, a missing node, and the name-or-path label resolution (a `packages/*`-style name label alongside an `apps/*`-style path label)

## 4. Wire into lint

- [ ] 4.1 Add a `check:dependency-graph` script to `package.json` (`bun tools/check-dependency-graph.ts`)
- [ ] 4.2 Append `&& bun run check:dependency-graph` to the `lint` script chain in `package.json`

## 5. Validate and land

- [ ] 5.1 Run `bunx openspec validate dependency-graph-guard --strict`
- [ ] 5.2 Run full `bun run build && bun run lint && bun run typecheck && bun test`; confirm the new guard passes cleanly against the corrected diagram
- [ ] 5.3 Manually verify the leaf check fails: add a throwaway `@canopy/*` devDependency to `packages/graph/package.json`, run lint, confirm it's caught with a clear message; revert
- [ ] 5.4 Manually verify the cycle check fails: add a throwaway devDependency edge that closes a cycle, run lint, confirm it's caught and the reported cycle path is correct; revert
- [ ] 5.5 Manually verify the doc-parity check fails: remove a mermaid edge (or add a stale one), run lint, confirm it's caught with the specific edge/node named; revert
