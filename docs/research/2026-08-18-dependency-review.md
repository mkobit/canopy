# Dependency review — monorepo audit

Track `canopy-08x` of the whole-system review epic `canopy-v9o`.
Read-and-report only — no code/config changes made; each real fix below still needs its own OpenSpec change + adversarial review before implementation, per project rules.

## Why

`canopy-08x.3` (the dual TypeScript compiler — `typescript@6.0.3` vs `typescript-native` = `npm:typescript@7.0.2`) is one confirmed instance of a class of problem: a dependency whose _actual resolved version_ depends on which entrypoint invoked it, with nothing in the repo asserting which one is authoritative.
This review audits all 16 manifests for the same class of drift — cross-manifest version mismatch, shadow/aliased installs, and resolution ambiguity not visible from any single `package.json` — and states, for each finding, which existing guard (if any) would have caught it.

## Scope

All 16 manifests: root `package.json`, `tools/package.json`, 9 `packages/*/package.json`, 5 `apps/*/package.json`.

## Method

1. Read every manifest's `dependencies`/`devDependencies`/`peerDependencies` directly (no `peerDependencies` exist anywhere in the workspace).
2. Grepped all 16 manifests for `"x": "npm:y@z"` alias syntax to find every shadow install, not just the known one.
3. Traced `typescript` / `typescript-native` resolution empirically at each entrypoint: inspected `node_modules/.bin/tsc`'s symlink target, each workspace's `build`/`typecheck` script, root `tsconfig.json`'s project references, `tools/lint-workspaces.ts`, and `.github/workflows/ci.yml` — rather than reasoning about shell semantics abstractly.
4. Ran `bun pm ls --all` (1,101 lines, saved to scratchpad) and grepped it for every package name that appears more than once at different versions, to find transitive duplication invisible from the manifests.
5. Cross-referenced `docs/architecture/bounded-contexts.md` (the doc `tools/check-dependency-graph.ts` enforces parity against) and `AGENTS.md`'s package-layout prose (which no guard touches) against the real 9-package layout.
6. Ran `bun run check:unused` (knip) and read `knip.json`'s `ignoreDependencies` entries.
7. Checked `package.json`'s `overrides` block and `mise.lock` for other pinned-version-with-no-cross-check patterns.

## Findings

### F1 — dual TypeScript compiler, resolution traced precisely (high, extends `canopy-08x.3`)

`devDependencies` carry both `typescript` (`6.0.3`, exact) and `typescript-native` (`npm:typescript@7.0.2`) at root only; every other manifest declares plain `typescript: 6.0.3`.
`node_modules/.bin/tsc` is a symlink to `../typescript/bin/tsc` (the real `typescript` package, 6.0.3) — `typescript-native`'s own `bin/tsc` is never hoisted there, so it is only reachable via its own path, exactly as the root scripts do it.

Empirically verified resolution per entrypoint:

| Entrypoint                                                        | Command                                                                                         | PATH modified?                                                                                                        | Resolved `tsc`             |
| :---------------------------------------------------------------- | :---------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- | :------------------------- |
| `bun run build` → packages                                        | `tsc -b` (root `tsconfig.json`, 9 project references to `packages/*`)                           | Yes — `PATH="$PWD/node_modules/typescript-native/bin:$PATH" tsc -b`                                                   | **7.0.2**                  |
| `bun run build` → apps                                            | `bun --filter './apps/*' build` (same script line, after `&&`)                                  | **No** — shell `VAR=val cmd1 && cmd2` scopes the assignment to `cmd1` only, not the chained `cmd2`                    | **6.0.3** (via `.bin/tsc`) |
| `bun run typecheck` (all workspaces)                              | `PATH="..." bun --filter '*' typecheck`                                                         | Yes — the PATH prefix wraps the _entire_ `bun --filter` invocation, and Bun's child processes inherit its environment | **7.0.2**, everywhere      |
| `bun run lint` (`tools/lint-workspaces.ts`)                       | ESLint's typed-linting `projectService`, which does `require('typescript')` from each workspace | N/A — Node module resolution walks `node_modules/`, never sees a bin on `PATH`                                        | **6.0.3**, always          |
| A developer running `cd packages/graph && bun run build` directly | `tsc -b tsconfig.build.json`, default PATH                                                      | No                                                                                                                    | **6.0.3**                  |
| CI (`ci.yml`)                                                     | `bun run build` then `bun run typecheck`                                                        | Same as above                                                                                                         | Same split as local        |

Net effect: a single `bun run build` invocation compiles `packages/*` under TS 7.0.2 and `apps/*` under TS 6.0.3 in the same run, `bun run typecheck` compiles everything under 7.0.2, and `bun run lint`'s type-aware program always uses 6.0.3 — three different authorities for "the" TypeScript version, selected by accident of shell assignment scoping and Node's `require` resolution, not by design.
This is a sharper version of `docs/research/2026-08-15-packaging-build-dev-tooling-review.md`'s F3: that doc correctly identified "root path = tsc 7, direct invocation = tsc 6" but didn't establish that the _root build script itself_ is already split (packages vs. apps), nor that lint sits on a third, `require`-resolved authority untouched by either PATH hack.

**Guard coverage:** none, fully.
`tools/verify-versions.ts` groups occurrences strictly by dependency-name string across manifests; `typescript` and `typescript-native` are different names and are never compared to each other, so this drift is invisible to it by construction — the tool can't detect any `npm:`-aliased package regardless of what it resolves to.
`check-dependency-graph.ts` only inspects `@canopy/*` internal edges.
`check-ci-tooling.ts` only inspects Bun-version pins and generated-artifact tracking.
Knip doesn't reason about compiler-version resolution at all.

**Fix direction:** decide the actual intent of `typescript-native` (native/bundled-binary compiler eval?) and either (a) make it the sole `typescript` across every manifest and delete the PATH hacks entirely, or (b) if a genuine dual-track evaluation is wanted, name it so the two are never both bound to a bare `tsc` lookup, and add an explicit test asserting which compiler ran (e.g. `tsc --version` captured per entrypoint in a check script). This is a design decision, not a mechanical fix — matches `canopy-08x.3`'s existing "Design" classification.

### F2 — `@storybook/addon-essentials` is two major versions behind Storybook core, in the same manifest (medium)

`apps/web/package.json` declares `storybook`, `@storybook/react`, and `@storybook/react-vite` all at `^10.5.4`, but `@storybook/addon-essentials` at `^8.6.14` — a same-file, same-tool-family mismatch, not a cross-manifest one.
`bun pm ls --all` confirms this resolves as declared: `@storybook/addon-essentials@8.6.14` pulls its own `@storybook/addon-actions`, `@storybook/addon-docs`, etc. at 8.6.14, which in turn pull nested `react@19.2.7`/`react-dom@19.2.7` (vs. the workspace's `react@19.2.8`) and `uuid@9.0.1` (vs. the workspace's `uuid@14.0.1`) purely to satisfy Storybook 8-era addon internals.

**Guard coverage:** none.
`verify-versions.ts` only fires on the _same dependency name_ appearing at _different versions across different files_; a single manifest declaring two packages from one logical family (`storybook` + `@storybook/*`) at incompatible majors is structurally outside what it checks.

**Fix direction:** bump `@storybook/addon-essentials` to `^10.5.4`, or drop it — Storybook 8→9 split `addon-essentials` into individually-installed addons in many setups, worth checking against the Storybook 10 migration notes before assuming a straight version bump is correct.
A new guard would need to group devDependencies by npm scope/tool family (e.g. everything under `@storybook/*` plus the bare `storybook` package) and assert they share a major version — `verify-versions.ts` would need a family-grouping extension, not a new tool.

### F3 — transitive `uuid` triple-resolution (low, informational)

`bun pm ls --all` shows three resolved `uuid` versions: `uuid@14.0.1` (matches root's and `@canopy/graph`'s declared `^14.0.0`), `uuid@11.1.1` (nested under `@effect/experimental` and `@effect/sql`, Effect's own internal dependency), and `uuid@9.0.1` (nested under `@storybook/addon-actions`, see F2).
No workspace manifest declares `uuid` at a conflicting version — this is pure transitive fan-out from third-party packages' own internal dependencies, not a repo-authored drift.
Workspace code only ever imports the top-level `uuid`, so runtime risk is effectively nil.

**Guard coverage:** none — by design, no existing tool inspects transitive-tree duplication at all (`verify-versions.ts` reads manifests, not the resolved tree; knip checks for unused/undeclared dependencies, not duplicate transitive versions).
Noted as informational; a `bun pm ls --all` skim is currently the only way to see this class of issue, and it's manual.

### F4 — `@bytecodealliance/preview2-shim`: exact-pinned runtime vs. bundled build-time version (low)

`apps/web/package.json` pins `@bytecodealliance/preview2-shim` at an exact `0.19.0` (no `^`) — the only exact-pinned runtime dependency in the entire workspace, a deliberate-looking choice given this shim is what makes the Tier-1 WASM plugin host's in-browser component instantiation real (per project history: `canopy-586`).
Separately, the `@bytecodealliance/jco`/`jco-transpile` devDependency toolchain (used only at `codegen:wit` build time) bundles its own, much older `preview2-shim@0.17.9` internally.
These are layered correctly by intent — one is a runtime dependency, the other is a build-tool-internal one — but nothing in the repo asserts that the jco-bundled 0.17.9 never leaks into what ships to the browser; it's implicit trust in jco's packaging, not a codified guarantee.

**Guard coverage:** none — outside what any of the four existing guards inspect.

**Fix direction:** low priority given the exact-pin already shows this is being treated carefully; if this needs hardening, a build-output grep (does the bundled/transpiled guest output reference `0.17.9` anywhere) would turn implicit trust into an assertion. Documentation-only otherwise.

### F5 — stale `overrides["@typescript-eslint/utils"]` pin (low)

Root `package.json` has `"overrides": { "@typescript-eslint/utils": "8.54.0" }`, dated to `fe7d405` (#134, "Fix build failure: lint errors and dependency issues").
`typescript-eslint` itself has since moved to `^8.65.0` in the same manifest — the override predates several minor bumps of the package whose conflict it was presumably resolving, and nothing has re-verified it's still necessary.

**Guard coverage:** none — `overrides` entries have no expiry or re-justification mechanism, unlike the project's own `eslint-disable` ceiling pattern (`tools/check-eslint-disable-ceiling.ts`), which is the closest analogous "escape hatch that can silently outlive its reason" the project already guards.

**Fix direction:** try removing it and running `bun install && bun run lint && bun run typecheck`; if clean, delete it. If still needed, add a one-line inline justification (package.json has no comment support, so put it in AGENTS.md's linting escape-hatches section, mirroring the required source comment for `ignoreTypePattern` entries).

### F6 — dead `knip.json` ignore entry (low)

`knip.json`'s `apps/web` workspace has `"ignoreDependencies": ["happy-dom", "tailwindcss", "canopy", "@bytecodealliance/jco"]`.
`happy-dom`, `tailwindcss`, and `@bytecodealliance/jco` all correspond to real, used dependencies/config.
`"canopy"` does not: it is not declared as a dependency anywhere in `apps/web/package.json`, and no import specifier `from 'canopy'` exists under `apps/web/src` or `apps/web/scripts`. This looks like leftover config from a rename or removed dependency.

**Guard coverage:** knip itself is clean (zero findings on the current tree) but has no mechanism to flag its own stale ignore-list entries — an ignore that suppresses nothing is exactly the failure mode `reportUnusedDisableDirectives: 'error'` prevents for ESLint, with no equivalent for `knip.json`.

**Fix direction:** remove the `"canopy"` entry; rerun knip to confirm it stays clean.

### F7 — `AGENTS.md` package-layout prose is stale; `bounded-contexts.md` is not (low, doc hygiene)

`AGENTS.md` states "Six packages: `@canopy/graph`, `@canopy/queries`, `@canopy/settings`, `@canopy/storage`, `@canopy/storage-indexeddb`, `@canopy/storage-sqlite`" — the repo actually has 9 (also `@canopy/api-adapter`, `@canopy/storage-file`, `@canopy/storage-http`).
By contrast, `docs/architecture/bounded-contexts.md` — the doc `tools/check-dependency-graph.ts` mechanically enforces mermaid-vs-`package.json` parity against — correctly lists and diagrams all 9 packages today.
Worth flagging precisely because it inverts a prior assumption: `check-dependency-graph.ts` is doing its job for the artifact it targets; the drift is in the un-guarded prose duplicate of the same fact living in `AGENTS.md`.

**Guard coverage:** `check-dependency-graph.ts` covers `bounded-contexts.md` only, by design (it's the one doc with a parseable mermaid block). `AGENTS.md`'s free-text package count has no guard and can't easily get one without parsing prose.

**Fix direction:** either update the "Six packages" line to name all 9, or delete the enumeration from `AGENTS.md` and point solely at `bounded-contexts.md` as the single source of truth, so this specific fact can't drift in two places again.

### F8 — `verify-versions.ts`'s "Verify Beads" step doesn't verify anything (informational)

The script extracts `miseBeadsVersion` from `mise.toml` via regex, but never compares it against a second, independent source — there isn't one in the repo today.
`mise.lock` also contains `1.2.2`, but that's a lockfile mise regenerates from `mise.toml` itself (analogous to `bun.lock` from `package.json`), not an independent declaration that could drift on its own.
So the check currently can't fail on a real Beads-version mismatch; it only asserts `mise.toml` has _a_ parseable Beads line, then echoes it in the success message.
Not a live risk today, but the name/comment overstates what it does, and if a second Beads-version reference is ever added (e.g., a CI step pinning it separately), this code has no logic to compare against it.

**Guard coverage:** N/A — noted for clarity, not as a gap needing a new guard.

## Guard coverage summary

| Finding                                  | `verify-versions.ts`                            | `check-dependency-graph.ts`       | `check-ci-tooling.ts`                                  | knip                                          |
| :--------------------------------------- | :---------------------------------------------- | :-------------------------------- | :----------------------------------------------------- | :-------------------------------------------- |
| F1 — dual TS compiler                    | Not covered (different names, never compared)   | N/A                               | Not covered (only checks Bun pins + artifact tracking) | N/A                                           |
| F2 — Storybook addon major mismatch      | Not covered (same-manifest, not cross-manifest) | N/A                               | N/A                                                    | Not covered                                   |
| F3 — transitive `uuid` triplication      | N/A (manifest-only, not resolved tree)          | N/A                               | N/A                                                    | Not covered                                   |
| F4 — `preview2-shim` runtime/build split | N/A                                             | N/A                               | N/A                                                    | N/A                                           |
| F5 — stale `overrides` pin               | N/A                                             | N/A                               | N/A                                                    | N/A                                           |
| F6 — dead knip ignore entry              | N/A                                             | N/A                               | N/A                                                    | Clean run, but no self-check on stale ignores |
| F7 — `AGENTS.md` package count stale     | N/A                                             | Covers `bounded-contexts.md` only | N/A                                                    | N/A                                           |
| F8 — no-op Beads "verification"          | Partially — asserts presence, not equivalence   | N/A                               | N/A                                                    | N/A                                           |

Positive/context results, stated because the task asked for the gap between "covered" and "not covered," not just failures:

- Every direct-dependency version _is_ aligned across all 16 manifests for everything `verify-versions.ts` actually compares (`effect`, `zod`, `remeda`, `fast-check`, `temporal-polyfill`, `@effect/cli`/`platform`/`platform-node`, `react`/`react-dom`, `@types/react`/`react-dom`, `fake-indexeddb`, `uuid` as directly declared, `typescript` itself) — the guard is effective for its actual scope.
- `typescript-native` is the **only** `npm:`-aliased shadow install anywhere in the 16 manifests — grepped for the `"x": "npm:y@z"` pattern across all of them; eslint, prettier, vite, and bun itself have no equivalent dual-alias structure. `canopy-08x.3` is not one instance of a wider pattern; it's the only instance.
- No `peerDependencies` are declared anywhere in the workspace.
- `bun run check:unused` (knip) reports zero unused/undeclared-dependency findings on the current tree, only two unrelated config hints (`.mdx`/`.css` extension exclusions in `apps/web`).

## Candidate follow-ups

Per the design-review gate, none of the above should become a task bead or OpenSpec change directly from this doc — each needs its own proposal + adversarial review. In rough priority order for triage: F1 (extends the already-open `canopy-08x.3` design item — this doc's resolution trace should feed that decision directly), F2 (concrete, mechanical, low-risk fix), F5/F6/F7 (small, independent hygiene fixes), F3/F4/F8 (informational, no action implied unless a reviewer wants a new guard class for transitive-tree duplication).
