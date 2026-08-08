## 1. Prerequisite check

- [ ] 1.1 Confirm `beads-ci-validation` (canopy-qvn.5) has landed `.github/workflows/beads-validation.yml` with a full-history (`fetch-depth: 0`) checkout step; if not, land its checkout + trigger scaffold first (see design's Ordering section) before proceeding.

## 2. Core reachability script

- [ ] 2.1 Create `tools/beads/check-merged-issues.ts` (Bun, argv-array `git`/`bd` invocations only, no shell string interpolation).
- [ ] 2.2 Implement boundary-anchored issue-ID matching against full commit messages (subject + body) reachable from `origin/main`, scoped to commits since the oldest still-checkable closed issue's close timestamp.
- [ ] 2.3 Implement code-bearing type filter (`task`, `bug`, `feature`, `chore` default; `epic`, `decision`, `story`, `milestone`, `spike` excluded) plus `no-code` / `code-bearing` label overrides.
- [ ] 2.4 Implement the 48h default grace period using bd's close-time data (verify whether `bd history <id>` exposes discrete close events; fall back to a single `closed_at` field if that's all the CLI surface provides).
- [ ] 2.5 Implement a cutoff-timestamp config value so only issues closed after the change lands are considered (skip pre-existing backlog).

## 3. Local advisory command

- [ ] 3.1 Add `bd:check-merged` script to `package.json` invoking `check-merged-issues.ts` against one or more issue IDs (or the IDs referenced in recent/unpushed commits).
- [ ] 3.2 Run `git fetch origin main` before checking reachability, so results reflect current `origin/main` rather than a stale local clone.
- [ ] 3.3 Exit non-zero with a named warning per drifted issue; exit zero otherwise.

## 4. CI wiring

- [ ] 4.1 Add a step to `.github/workflows/beads-validation.yml` invoking `check-merged-issues.ts` in report mode (all closed, code-bearing, non-exempt issues past the grace period and cutoff).
- [ ] 4.2 On drift, reuse the existing `[Beads Audit Failure]`-style `gh issue list`/`gh issue create` pattern from that workflow; on repeat runs, update the existing tracking issue's body with the current drifted-ID list instead of creating a duplicate.
- [ ] 4.3 Confirm the workflow's `issues: write` / `contents: read` permissions already cover this step; do not request additional scopes.

## 5. Rollout safety

- [ ] 5.1 Before enabling the CI step as active, run the script in dry-run/report-only mode against recent `origin/main` history to measure actual issue-ID coverage in commit messages, so the expected false-positive rate is known (per design's verified finding that squash-merges routinely omit or partially list IDs).
- [ ] 5.2 Based on that measurement, decide whether the cutoff/grace-period defaults need adjusting before the step goes live.

## 6. Validation and testing

- [ ] 6.1 Unit-test boundary-anchored matching against known-adjacent ID pairs (e.g. `canopy-qvn` vs `canopy-qvn.5`, `canopy-c54` vs `canopy-c54.1`).
- [ ] 6.2 Unit-test grace-period and cutoff-timestamp filtering.
- [ ] 6.3 Test the local command against a real closed issue with a reachable commit and one without.
- [ ] 6.4 Test CI issue create/update-in-place logic (mocked `gh` calls or a scratch repo), including the "drift resolves, IDs removed from tracking issue body" path.
