# Packaging, build & dev-tooling review

Track `canopy-08x` of the whole-system review epic `canopy-v9o`.
Review/decision work only — each real change below still needs its own OpenSpec change + adversarial review before implementation, per project rules.

## Scope

Audit the build and developer-tooling surface: the Vite-vs-Bun bundler split (`canopy-kjg`), the WASM transpile/codegen pipeline, generated-artifact hygiene, `mise`/CI alignment, the per-workspace ESLint runner (`tools/lint-workspaces.ts`), and the `tools/*.ts` check scripts wired into `bun run lint`.
Produce a durable guard so the sharpest class of drift found here cannot silently return.

## Method

Read every root and workspace `package.json` `scripts` block, `bunfig.toml`, `mise.toml`, `.github/workflows/*.yml`, `.gitignore`, `.husky/*`, `knip.json`, and each `tools/*.ts` script, then traced how each script is (or is not) invoked by `bun run lint`, the husky pre-commit hook, and CI.
Verified generated-artifact hygiene by grepping the git index for the plugin-output paths.

## Pipeline map (as built today)

| Stage          | Entrypoint                                                                                                  | Tool                                                          |
| :------------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------ |
| Build (root)   | `tsc -b` (via `typescript-native/bin` on `PATH`) + `bun --filter './apps/*' build`                          | tsc 7 (`typescript-native`, aliased `typescript@7.0.2`)       |
| Build (web)    | `codegen:wit` → `tsc` → `vite build`                                                                        | `jco` + `Bun.build` + tsc + Vite                              |
| Build (others) | `tsc -b tsconfig.build.json`                                                                                | bare `tsc` (resolves to `typescript@6.0.3` when run directly) |
| Lint           | `check-commands` → `check:versions` → `check:api-compatibility` → `check:unused` (knip) → `lint-workspaces` | Bun + ESLint (one process per workspace)                      |
| Typecheck      | `tsc` via `typescript-native/bin` on `PATH`, `bun --filter '*'`                                             | tsc 7                                                         |
| Test           | `bun --filter '*' test`                                                                                     | Bun                                                           |
| Pre-commit     | `.husky/pre-commit` → `bun run check:versions`                                                              | Bun (single check only)                                       |
| CI             | mise setup → `bun install` → build → lint → typecheck → test                                                | GitHub Actions + mise                                         |

## Findings

### F1 — dead and misleading `bun-version` CI matrix axis (major)

`.github/workflows/ci.yml` declares `matrix.bun-version: [1.3.14]`, but no step references `matrix.bun-version`.
Bun is actually installed by `jdx/mise-action` from `mise.toml` (`bun = "1.3.14"`); the matrix axis is decorative and inert.
This is a fourth, unchecked source of the Bun version — alongside `package.json` `engines.bun`, `mise.toml` `tools.bun`, and the `bun-types` devDep (`^1.3.14`).
`tools/verify-versions.ts` asserts `engines.bun` equals `mise.toml`, but nothing checks the CI workflow, so the axis can silently pin a stale version that looks authoritative but controls nothing.
Fix: remove the axis (mise.toml is the single source) or wire it to mise; either way, teach `verify-versions.ts` about the CI workflow so the guard covers it (see C1).

### F2 — `check:openspec-changes` is orphaned from all automation (major)

`tools/check-openspec-changes.ts` validates OpenSpec changes touched in `git diff --cached` — it is written as a pre-commit hook.
It is wired nowhere: not in `bun run lint`, not in `.husky/pre-commit` (which runs only `check:versions`), and CI's `paths-ignore` excludes `openspec/**` entirely.
The design docs (`docs/superpowers/plans/2026-07-31-*.md`) list `bun run check:openspec-changes` in an intended hook allowlist, so the wiring was planned but never landed on this branch.
The only place OpenSpec is validated is the Claude-agent hook `tools/hooks/openspec-validate-hook.ts` — i.e. only when an agent commits, never for CI or a non-agent contributor.
Combined with `paths-ignore: openspec/**`, an OpenSpec-only PR runs zero validation of any kind.
Fix: wire `check:openspec-changes` into `.husky/pre-commit` (staged-file scoped, cheap) and reconsider whether `openspec/**` should still be CI-ignored now that a strict validator exists (`bunx openspec validate --strict`).

### F3 — two TypeScript compilers, selected by entrypoint (major)

`devDependencies` carry both `typescript@6.0.3` and `typescript-native` (`npm:typescript@7.0.2`).
The root `build` and `typecheck` scripts prepend `$PWD/node_modules/typescript-native/bin` to `PATH`, so `tsc` there is tsc 7.
Every per-workspace `build`/`typecheck` script calls bare `tsc`, which resolves to `typescript@6.0.3` when invoked directly (e.g. `bun --filter @canopy/web typecheck`, or a package-local `bun run build`).
Which compiler runs therefore depends on whether the invocation went through the root PATH hack — the root/CI path uses tsc 7, a direct package invocation uses tsc 6.
A package can pass typecheck under one compiler and not the other, and nothing pins or asserts which one is authoritative.
This is the concrete build-tooling debt behind `canopy-kjg`; resolving it (converge on one compiler, or make the PATH selection explicit and uniform) needs its own decision.

### F4 — CI pipeline order is duplicated, not single-sourced (medium)

The build→lint→typecheck→test order lives in two places: the step sequence in `ci.yml`, and the `mise` `check` task (`bun run build && bun run lint && bun run typecheck && bun test`).
They agree today, but nothing keeps them in sync; a change to one is invisible to the other.
Fix direction: have CI invoke `mise run check` (or a shared script) so the local reproducer and CI cannot drift, or add an assertion that the two definitions match.

### F5 — Vite and Bun bundlers already coexist inside `apps/web` (context, `canopy-kjg`)

`apps/web` is the only Vite consumer (`vite dev`, `vite build`); every other workspace builds with tsc and tests with Bun.
The WASM codegen (`scripts/wit-codegen.ts`) already bundles the guest plugin with `Bun.build` and componentizes it with `jco` — so a Vite build and a Bun bundle already run side by side in one app.
`canopy-kjg` tracks consolidating onto Bun's native bundler; this review records that a partial Bun-bundler precedent exists, and leaves the consolidation to that bead.
No new bead — cross-referenced to `canopy-kjg`.

### F6 — generated-artifact hygiene is clean (context, good)

Every WASM/codegen output — `guest.js`, `plugin.wasm`, `transpiled/`, `plugin-node.json`, `src/plugin/types/` — is `.gitignore`d, and `git ls-files` confirms none are tracked.
The hygiene invariant (`feedback_no_generated_artifacts_in_git`) holds today.
The risk is regression, not current state: nothing fails if a future commit stages one of these paths, so this is the natural target for the durable guard (C1).

### F7 — the per-workspace ESLint runner is sound (context, good)

`tools/lint-workspaces.ts` runs `eslint` once per workspace to bound peak RSS to the largest single workspace's type-aware program (~1.1GB) instead of the ~3GB sum, which used to OOM macos-14 runners (`canopy-9ec`).
The rationale is documented inline and in `ci.yml`; the design is correct and needs no change.
One minor observation: the runner and CI both re-derive the workspace list from the filesystem, so a new workspace is picked up automatically — good.

### F8 — husky pre-commit is intentionally thin (context)

`.husky/pre-commit` runs only `check:versions`; the full gates (build/lint/typecheck/test) run in CI.
This is a deliberate fast-commit tradeoff, not a defect — noted so it is not "fixed" by piling gates onto pre-commit.
The one thing missing from it that is cheap and staged-scoped is `check:openspec-changes` (F2).

### F9 — no release/versioning surface exists yet (context, N/A)

All 14 workspaces are `private: true` at `version: 0.0.0`; nothing is published.
The bead's "release/versioning" scope has no artifact to review pre-1.0 — recorded so a future reviewer does not go looking for machinery that intentionally does not exist (`canopy-pre-release-no-real-users`).

## Codification (the durable guard)

### C1 — `tools/check-ci-tooling.ts`, wired into `bun run lint`

A single static automation that asserts:

1. **CI tool-version consistency** — the Bun version in `ci.yml` (and `beads-validation.yml`) is consistent with `mise.toml`/`package.json`, or the `bun-version` matrix axis is absent (catches F1, and any future stale CI pin).
2. **Generated-artifact hygiene** — none of the `.gitignore`d plugin-output paths (`**/guest.js`, `**/plugin.wasm`, `**/transpiled/`, `**/plugin-node.json`, `src/plugin/types/`) are tracked by `git ls-files` (catches F6 regressions before they land).

Optionally it can also assert the CI step order matches the `mise` `check` task (F4), or that check can stay a separate small change.
This is a CI-gating automation, so per `feedback_measure_before_gating_ci_checks` it must be dry-run against current `main` first — it should report exactly F1 (the dead axis) and nothing else — before it is wired to fail.
It is a real change → filed as a codification bead needing OpenSpec + adversarial review, not implemented in this review.

The cheapest incremental alternative, if a new tool is unwanted, is to extend the existing `tools/verify-versions.ts` (already in `lint`) with the CI-workflow Bun-version assertion; the artifact-hygiene check would still need a home.

## Bead summary

- Fix: F1 — remove the dead `bun-version` CI matrix axis; mise.toml is the sole Bun source (`canopy-08x.1`).
- Fix: F2 — wire `check:openspec-changes` into `.husky/pre-commit` and reconsider the `openspec/**` CI `paths-ignore` (`canopy-08x.2`).
- Design: F3 — resolve the dual-TypeScript-compiler entrypoint drift (tsc 6 vs `typescript-native` tsc 7); relates to `canopy-kjg` (`canopy-08x.3`).
- Codify: C1 — `tools/check-ci-tooling.ts` version-source + artifact-hygiene guard, wired into `lint` (OpenSpec + adversarial review; measure before gating) (`canopy-08x.4`).
- Cross-ref: F5 Vite/Bun consolidation stays on `canopy-kjg`; F6/F7/F8 left intentionally as-is; F9 is N/A pre-1.0.
