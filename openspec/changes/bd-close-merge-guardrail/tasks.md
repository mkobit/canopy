## 1. Prerequisite check

- [x] 1.1 Confirm `beads-ci-validation` (canopy-qvn.5) has landed `.github/workflows/beads-validation.yml` with a full-history (`fetch-depth: 0`) checkout step. Landed via PR #428.

## 2. Core reachability logic

- [x] 2.1 Create `tools/lib/beads-merge-check.ts` (Bun, argv-array `git`/`bd` invocations only, no shell string interpolation) -- consolidated with the existing `beads-ci-validation` audit tooling rather than a standalone `tools/beads/` script; see proposal.md's implementation note.
- [x] 2.2 Implement boundary-anchored issue-ID matching (`issueIdPattern`, both leading and trailing boundaries) against full commit messages (subject + body) reachable from `origin/main`.
- [x] 2.3 Implement code-bearing type filter (`task`, `bug`, `feature`, `chore` default; `epic`, `decision`, `story`, `milestone`, `spike` excluded) plus `no-code` / `code-bearing` label overrides (`isCheckable`).
- [x] 2.4 Grace period (default 48h) and cutoff implemented via `bd query`'s own date filtering (`status=closed AND closed<2d AND closed>"<cutoff>"`) rather than TS-side date arithmetic -- simpler, and confirms `closed_at` alone is sufficient (no need for `bd history`'s per-event surface, per design's stated fallback).
- [x] 2.5 Cutoff-timestamp constant (`MERGE_CHECK_CUTOFF`) implemented in `tools/audit-beads-conventions.ts`, so only issues closed after the change landed are considered.

## 3. Local advisory command

- [x] 3.1 `bun tools/audit-beads-conventions.ts --check-issue <id>` (single-issue advisory mode in the consolidated script, not a separate `bd:check-merged` script).
- [x] 3.2 Runs `git fetch origin main --quiet` before checking reachability.
- [x] 3.3 Exits non-zero with a named warning if unreachable; exits zero if reachable.

## 4. CI wiring

- [x] 4.1 Merge-drift check runs as part of the same `bun run audit:beads --report` invocation already wired into `.github/workflows/beads-validation.yml` (PR #428) -- not a separate workflow step, since it shares the same script/report.
- [x] 4.2 Reuses the existing `[Beads Audit Failure]` `gh issue list`/create-or-update pattern, but **does not** trigger it on its own (see task 5 below) -- findings appear in the report body only when the lint/label checks already caused a failure.
- [x] 4.3 No new permissions requested; reuses `beads-validation.yml`'s existing `issues: write` / `contents: read`.

## 5. Rollout safety

- [x] 5.1 Measured actual issue-ID coverage before enabling (2026-08-08): 48 issues closed in the prior 14 days, 18 (37.5%) would have been flagged as drifted despite genuinely landing -- squash-merge messages routinely omit some closed IDs.
- [x] 5.2 Based on that measurement: demoted the merge-drift check to informational-only in CI (never fails the run or triggers tracking-issue creation by itself); local runs still fail on any finding. See design.md's "Rollout finding" section.

## 6. Validation and testing

- [x] 6.1 Unit-tested boundary-anchored matching against adjacent ID pairs (`canopy-qvn` vs `canopy-qvn.5`, `canopy-c54.1` vs `canopy-c54.10`, leading-boundary case) in `tools/beads-merge-check.test.ts`; also verified live against real history (`canopy-qvn` correctly reported unreachable despite `canopy-qvn.5`/`.7` being all over recent commits).
- [x] 6.2 Unit-tested `isCheckable` (type + label exemption/opt-in logic) and `parseClosedIssues` (including the `labels`-key-absent-when-empty quirk).
- [x] 6.3 Tested the local `--check-issue` command live against a real closed+merged issue (`canopy-k26`, reachable) and a real closed-without-its-own-commit issue (`canopy-qvn`, unreachable).
- [x] 6.4 `buildAuditResult`/`formatReportBody` unit tests cover create-vs-update-in-place reuse (shared with `beads-ci-validation`'s existing tests) and confirm unmerged-close findings land in `informationalFindings`, not `failingFindings`.
