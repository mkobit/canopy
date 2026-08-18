## Why

The Bun toolchain version is pinned in `mise.toml` as the single source, but nothing checks that a CI workflow file cannot independently pin a different Bun version — and one already has: `.github/workflows/openspec.yml` pins `1.3.12` via `oven-sh/setup-bun` while `mise.toml` pins `1.3.14`, a live drift on `main` today.
Separately, every WASM/codegen output (`guest.js`, `plugin.wasm`, `transpiled/`, `plugin-node.json`, `src/plugin/types/`) is `.gitignore`d and untracked today, but nothing fails if a future commit stages one — the hygiene invariant (`feedback_no_generated_artifacts_in_git`) holds only by convention.
This codifies findings F1 (stale CI Bun-version pin) and F6 (generated-artifact hygiene regression) from `docs/research/2026-08-15-packaging-build-dev-tooling-review.md` into a durable guard so neither class of drift can silently return.

## What Changes

- Add `tools/check-ci-tooling.ts`, a single typed guard script, wired into `bun run lint`, that asserts two invariants:
  1. **CI Bun-version consistency** — scan every `.github/workflows/*.yml` for any Bun-version pin (a `oven-sh/setup-bun` step's `bun-version` input, including one that resolves through a workflow `env:` variable), and fail if any resolved pin differs from `mise.toml`'s `tools.bun`. A workflow that installs Bun via `jdx/mise-action` with no separate pin is compliant (mise is the sole source).
  2. **Generated-artifact hygiene** — fail if `git ls-files` reports any tracked path matching the generated plugin-output globs (`**/guest.js`, `**/plugin.wasm`, `**/transpiled/**`, `**/plugin-node.json`, `apps/web/src/plugin/types/**`).
- Remediate the live drift the guard surfaces on `main`: align `.github/workflows/openspec.yml` to `mise.toml`'s Bun version (preferably by switching it to `jdx/mise-action`, collapsing to the single source), so the check is green at gate-time per the measure-before-gating rule.
- Wire the script into the `lint` chain in `package.json` after the existing `tools/*.ts` guards.

`tools/verify-versions.ts` is unchanged: it keeps owning `package.json engines.bun ↔ mise.toml` and workspace dependency uniformity. The new script owns the CI-workflow and git-index hygiene axes it does not touch.

## Capabilities

### New Capabilities

- `ci-tooling-guard`: a lint-wired static guard asserting that every CI workflow's Bun-version pin is consistent with the `mise.toml` toolchain source, and that no `.gitignore`d generated plugin-output artifact is tracked by git.

### Modified Capabilities

<!-- None. verify-versions.ts's package-manifest version-consistency requirements are unchanged; this adds a separable CI-workflow + git-index hygiene mechanism, not a change to those requirements. -->

## Impact

- `tools/check-ci-tooling.ts` — new guard script (Bun built-in `fs` + a `git ls-files` invocation; no new dependency).
- `package.json` `lint` script + `scripts` — new `check:ci-tooling` entry wired into the `lint` chain.
- `.github/workflows/openspec.yml` — Bun-version source aligned to `mise.toml` (remediates the drift the guard would otherwise fail on).
- Contributors and CI: a new failure mode (a workflow pinning a drifted Bun version, or a staged generated artifact) with a self-describing remedy.
- No runtime, API, or user-data surface; pre-release (`canopy-pre-release-no-real-users`).
