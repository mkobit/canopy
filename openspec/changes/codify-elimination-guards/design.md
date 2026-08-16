## Context

The elimination epic `canopy-v9o.1` (kernel stays Effect-free; functional rewrites) is about to remove ~578 anchored `eslint-disable` directives across `packages/`, `apps/`, and `tools/`.
A rewrite that lands is not durable: a later PR can reintroduce a disable, or leave a stale one behind after refactoring the code it guarded.
`bun run lint` today runs `tools/lint-workspaces.ts`, which spawns one `eslint --cache` process per workspace plus a `tools + eslint.config.mjs` group; there is no directive accounting and `reportUnusedDisableDirectives` is unset.

Separately, the owner directive (2026-08-15) requires perf-based modules to carry perf/load tests. Two kernel files dominate the disable count and are perf-critical: `packages/graph/src/incremental-projection.ts` (78) and `packages/graph/src/indexes.ts` (77). The latter already has `packages/graph/scripts/bench-index-maintenance.ts`; the former has none.

Constraint from `feedback_measure_before_gating_ci_checks`: dry-run any new gating check against `main` first and confirm a clean baseline before wiring it to fail CI.

**Dry-run result (against `main`, this change's investigation):** `eslint … --report-unused-disable-directives` across every workspace and the `tools + eslint.config.mjs` group reported **zero** unused directives (exit 0 everywhere). Flipping to `error` therefore breaks nothing on `main` — the "free win" is confirmed free, with no cleanup pass needed before committing the baseline. Anchored directive count is ~578 total, ~568 after dropping eslint-ignored paths; the counter script produces the authoritative committed baseline at implementation.

## Goals / Non-Goals

**Goals:**

- Reject `eslint-disable` directives that suppress nothing (`reportUnusedDisableDirectives: 'error'`).
- Enforce a monotonic-non-increasing ceiling on total directives against a committed baseline, wired into `bun run lint`.
- Make the counting method deterministic, documented, and reproducible so the baseline is unambiguous.
- Codify the perf-test policy in `AGENTS.md` with a maintained inventory; file beads for gaps.

**Non-Goals:**

- Automatically rewriting or removing directives (that is the rewrite beads' job, `v9o.1.5`–`.26`).
- Per-rule or per-file ceilings — one global integer keeps the ratchet simple and hard to game.
- Building perf-test _enforcement_ automation for `AGENTS.md` (the policy is a convention + inventory; automated gating of perf tests is out of scope here).
- Designing the projection/index carve-out itself — that is `canopy-v9o.1.2`.

## Decisions

### Decision 1: `reportUnusedDisableDirectives` in flat config, not the CLI flag

Set `linterOptions: { reportUnusedDisableDirectives: 'error' }` as a config object in `eslint.config.mjs` applying to all files, rather than passing `--report-unused-disable-directives` in `lint-workspaces.ts`.

- **Why**: config-level enforcement also lights up in editors/IDE integrations and in any direct `eslint` invocation, not just the wrapper script. One source of truth.
- **Alternative considered**: CLI flag in the spawn args — rejected; invisible to IDEs and easy to drop when the script is refactored.
- **Cache interaction**: a directive only becomes unused when its file changes, which invalidates that file's `--cache` entry, so unused-directive detection stays correct under caching.

### Decision 2: grep-based counter with a single canonical, anchored pattern

A new `tools/check-eslint-disable-ceiling.ts` counts directives by scanning **git-tracked** `*.ts`, `*.tsx`, `*.mjs` files under `packages/`, `apps/`, `tools/`, plus root `eslint.config.mjs`, matching the anchored pattern `^\s*(//|/\*)\s*eslint-disable` (comment-start only).

- **Why anchored**: raw substring matching over-counts by ~3 (prose/string mentions of the token in `tools/audit-*.ts`, `tools/refactor-ts.ts`, and doc-comment references). Anchoring to comment-start counts only real directives.
- **Why grep over programmatic eslint**: eslint offers no "count all directives" API; running an ESLint instance purely to count is far slower and couples the counter to lint execution. A line scan is sub-second and trivially auditable.
- **Exclusions** mirror `eslint.config.mjs` `ignores` for the paths that actually contain directives today: `**/dist/**`, `**/transpiled/**`, `node_modules`, `**/*.d.ts`, `apps/web/src/plugin/markdown/guest.ts`, `apps/web/src/plugin/mock/**`, `apps/web/src/plugin/draft-session-shim.ts`, and the ignored `scripts/` dirs (`apps/web/scripts`, `apps/extension/scripts`, `packages/graph/scripts`). Directives in ignored files are inert (eslint never evaluates them), so counting them would gate on dead code.
- **Alternative considered**: count via `git grep` in a shell one-liner in the lint script — rejected; the exclusion logic and the baseline-update affordance are clearer as a small typed script, consistent with the existing `tools/*.ts` checks.

### Decision 3: committed baseline file, loose ratchet (`count > ceiling` fails)

The baseline lives in a committed data file `tools/eslint-disable-baseline.json` (`{ "ceiling": <int> }`). The check fails when `count > ceiling`. When `count < ceiling` it prints a non-fatal nudge with the exact new number and `bun tools/check-eslint-disable-ceiling.ts --update`.

- **Why a separate data file**: lowering the ceiling becomes an obvious, reviewable one-line diff — matching the bead's "unless the baseline is explicitly lowered."
- **Why loose (not `count !== ceiling`)**: a strict equality ratchet would force every unrelated PR that happens to remove a disable to also touch the baseline file, adding friction and merge conflicts. The acceptance criterion is "fails a newly-added disable and **passes when count decreases**" — loose satisfies it. Regressions are still blocked; the ceiling is tightened deliberately by rewrite beads.
- **Anti-gaming**: raising `ceiling` is a visible diff reviewed like any config change; there is no path to add a disable silently.

### Decision 4: flip-then-clean-then-baseline sequencing

Order of operations in this change: (1) add `reportUnusedDisableDirectives: 'error'`; (2) run lint and remove any now-unused directives surfaced; (3) measure the post-cleanup count with the new counter; (4) commit that number as the baseline; (5) wire the check into `bun run lint`.

- **Why**: guarantees a clean baseline at gate-time (the measure-before-gating requirement). The baseline is the honest post-cleanup floor, not an inflated pre-cleanup number.

### Decision 5: perf-test policy as convention + inventory, not new automation

Add an `AGENTS.md` section stating the rule and a small inventory table (module → benchmark → status/bead). Seed it with `indexes.ts` (covered by `bench-index-maintenance.ts`) and `incremental-projection.ts` (gap). Reference `canopy-v9o.1.2` for the projection benchmark rather than filing a duplicate; file a fresh bead only if `.1.2`'s scope does not already commit to a projection perf test.

## Risks / Trade-offs

- **Flipping `reportUnusedDisableDirectives` to `error` breaks lint on pre-existing stale directives** → dry-run against `main` already run and clean (zero unused directives repo-wide), so no cleanup is required before committing the baseline; the flip is a pure free win. Task 1.2/1.3 remain as a re-confirmation guard in case of drift between now and merge.
- **Counter scope drifts from `eslint.config.mjs` ignores** (a future ignore change makes the counter and eslint disagree) → keep the exclusion list minimal, comment each entry with its eslint.config source, and add a unit test asserting the count on a fixture; revisit if `ignores` grows.
- **Loose ratchet lets slack accumulate** (count sits below ceiling without the ceiling following) → non-fatal nudge on every under-count run, and each rewrite bead lowers the ceiling as its closing step; the epic's whole purpose is to drive the number down.
- **Block `/* eslint-disable */` region disables count as 1 yet suppress a whole span** → there are 0 block disables today and the catch-all is already discouraged in `AGENTS.md`; if one is introduced, `reportUnusedDisableDirectives` and review catch it. The ceiling measures directive _count_, not suppressed-instance breadth, by design.
- **`--cache` masks a directive that became unused** → not possible for the unused case (file edit invalidates cache); documented for future readers.

## Migration Plan

1. Land config + counter + baseline + lint wiring + `AGENTS.md` in one PR (self-contained dev tooling; pre-release, no runtime/user impact).
2. Rollback = revert the `linterOptions` block, drop the counter from the `lint` script, delete `tools/eslint-disable-baseline.json`. No data or API surface touched.
3. Contributor-facing change: a new lint failure mode with a one-line remedy printed by the check (rewrite the code, or `--update` to lower the baseline; raising it requires a reviewed diff).

## Adversarial review and mitigations

**Resource / performance overhead.**
The counter is a single line-scan over git-tracked source (~hundreds of files) — sub-second, run once per `bun run lint` (not per workspace). `reportUnusedDisableDirectives` adds no measurable cost: eslint already parses directive comments to apply them; reporting unused ones is bookkeeping on data it already has. Net CI impact: negligible, well under the existing per-workspace eslint program cost (~seconds each). No new heap pressure (the counter does not load a TypeScript program, unlike the eslint passes it sits beside).

**Edge cases / failure modes.**

- _Directive form coverage_: `eslint-disable-next-line`, `eslint-disable-line`, and block `/* eslint-disable */` all start a comment with the token, so the anchored pattern catches all three. A single directive listing multiple rules counts once (correct: one escape hatch).
- _Over-count from string mentions_: mitigated by anchoring to comment-start; validated empirically (raw 581 → anchored 578, the 3 delta being non-directive mentions).
- _Under-count from ignored files_: the exclusion list drops the ~10 directives in eslint-ignored paths so the counter matches what eslint actually governs.
- _Stale-baseline drift after cleanup_: sequencing (Decision 4) measures the baseline only after the unused-directive cleanup, so it cannot bake in soon-to-be-removed directives.
- _Fixture test_: a unit test pins the counter's output on a small fixture so a future regex or scope change is caught rather than silently shifting the baseline.

**Security / isolation.**
Dev-tooling only; no runtime, network, or data-plane surface. The one trust consideration is a PR raising `ceiling` to smuggle in a disable — mitigated because the baseline is a committed integer whose increase is a visible one-line diff subject to the same review as any lint-config change. No privileged execution, no new dependency (uses Bun's built-in file APIs, consistent with existing `tools/*.ts`).

**Migration / backward compatibility.**
The baseline artifact is new — nothing consumes it yet, so there is no compatibility surface to break. Rollback is a clean revert of three edits (config block, lint-script line, baseline file). Pre-release status (`canopy-pre-release-no-real-users`) means no user data or vault is touched. The only downstream is contributor workflow, addressed by the self-describing failure message and the `AGENTS.md` documentation of both guards.

## Open Questions

- Should the counter also gate `*.js` sources? Today the only `.js` directives live in eslint-ignored generated files (`guest.js`), so `.mjs`/`.ts`/`.tsx` scope suffices; revisit if hand-authored `.js` appears.
- Does `canopy-v9o.1.2` already commit to a projection perf test, or is a distinct gap bead needed? Resolve while writing the inventory (Decision 5).
