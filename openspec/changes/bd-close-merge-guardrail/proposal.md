## Why

On 2026-08-06 a local/origin branch (`storybook-setup`) was found holding 50 unmerged commits implementing 8 bd issues that were already marked `closed` (canopy-gtv.1, .2, .2.1, .2.3, canopy-pm0.1, .2, canopy-qvn.4, .6, plus canopy-oni's knip work), with no PR ever opened.
`bd close` has no notion of "reachable from the default branch," so an issue's status can say done while its implementation sits stranded indefinitely — discoverable only by manual git archaeology, which is how this was found.
`bd` is a third-party binary (no pre-close hook API; `bd hooks` only wraps git lifecycle events), so the guardrail has to live in project tooling rather than in `bd` itself.

## What Changes

- Add a script that cross-references closed, code-bearing bd issues against `origin/main` and flags any whose issue ID has no reachable commit trailer after a grace period.
- Wire that script into CI (extending the not-yet-implemented `.github/workflows/beads-validation.yml` from the `beads-ci-validation` change, canopy-qvn.5, rather than standing up a second scheduled workflow) so drift is caught automatically instead of by manual audit.
- Add a fast local check (`bun run bd:check-merged <id>`, or a `bd doctor`-style advisory) that a developer or agent can run before/after `bd close` to get the same signal immediately, without requiring `bd` to support blocking pre-close hooks.
- Document the convention this relies on: code-bearing issue IDs must appear in the commit message (trailer or subject) of the commit(s) that implement them — already the de facto style in this repo's merge commits (e.g. `(canopy-pm0.3, canopy-k26)`).

## Capabilities

### New Capabilities

- `beads-close-merge-guardrail`: detects and reports bd issues marked closed whose implementing commits are not reachable from `origin/main`, for code-bearing issue types, after a grace period.

### Modified Capabilities

<!-- None. beads-ci-validation (canopy-qvn.5) has not landed as a spec yet -- this change adds a new capability rather than modifying an existing spec. -->

## Impact

- New script (e.g. `tools/beads/check-merged-issues.ts`), invoked both locally and from CI.
- `.github/workflows/beads-validation.yml`: gains a step for this check if/when the beads-ci-validation workflow exists; this change's tasks must handle either creation order.
- `package.json`: new `bd:check-merged` (or similarly named) script.
- No changes to `bd` itself or to existing bd issue data.

## Implementation note (2026-08-08, post-implementation)

- Consolidated into the existing `beads-ci-validation` audit script rather than a standalone file: the merge-drift logic lives in `tools/lib/beads-merge-check.ts` (pure, unit-tested), wired into the same `tools/audit-beads-conventions.ts` entry point (`bun run audit:beads` for the full scheduled audit, `bun tools/audit-beads-conventions.ts --check-issue <id>` for the local single-issue advisory check) rather than a second script and a second `gh issue` search/create-or-update implementation.
- A real coverage measurement found this check too noisy (37.5% false-positive rate) to fail CI or trigger tracking-issue creation on its own — it ships informational-only in the CI/report path, but a local invocation without `--report` still exits non-zero on any finding. See design.md's "Rollout finding" and the revised `beads-close-merge-guardrail` spec.
