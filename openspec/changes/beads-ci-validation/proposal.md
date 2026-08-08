# Proposal: Beads CI validation and automated reporting

## Summary

Adds a GitHub Actions CI workflow and automated job to run `bd lint` and a targeted `bd query` check on a weekly schedule (and on-demand).
Automates detection of missing acceptance criteria and missing labels, with automatic issue creation for failure reports; also surfaces a parentless-issue count as an informational annotation, not a failure trigger.

## Context

Canopy uses `bd` (beads) for issue tracking and OpenSpec for change proposals.
Ensuring convention compliance across all beads issues prevents orphan issues and missing acceptance criteria.
Running automated validation in GitHub Actions keeps issue metadata consistent and surfaces debt automatically.

**Revision (2026-08-07)**: the mechanism originally proposed here (`bd doctor --check=conventions` and `bd preflight`) does not work in this repo. `bd doctor` unconditionally refuses to run — `bd info` shows this repo's database in `direct` (embedded Dolt) mode, and `bd doctor` prints `'bd doctor' is not yet supported in embedded mode` for every `--check` variant, verified empirically. `bd preflight` runs a hardcoded Go-project checklist (`go test`, `golangci-lint`, `gofmt`, a `cmd/bd/version.go` path check) that doesn't apply to this Bun/TypeScript repo and fails for reasons unrelated to beads conventions. This revision replaces both with `bd lint` (works, checks for missing recommended sections) and `bd query` (works, expressive enough for missing-label checks) — commands verified to actually run against this repo's `direct`-mode database.

**Revision 2 (2026-08-07, after independent adversarial review)**: dropped the `push`-to-`main` trigger and `paths-ignore` filtering (the audit recomputes the whole backlog every run regardless of which files changed, so push-triggering added no signal over the weekly cron); demoted the "orphan" query from a failure trigger to an informational annotation only, since it returns near-zero real matches today and this repo routinely and legitimately spins off parentless non-epic follow-on issues (verified: `canopy-6cz`, `canopy-2qu`, `canopy-9g1` are all intentionally parentless), so treating it as a failure would just encourage inventing fake parents to silence the check.

## Proposed changes

1. Create a GitHub Actions workflow `.github/workflows/beads-validation.yml`.
2. Configure a scheduled cron trigger (`0 12 * * 3`, Wednesdays) and `workflow_dispatch` for manual runs; no push trigger (see Revision 2 above).
3. Execute `bd lint --json` (open issues only, missing recommended sections e.g. Acceptance Criteria) and `bd query "label=none AND status!=closed" --json` (missing labels) as the two checks that can fail the run; separately run `bd query "parent=none AND type!=epic AND status!=closed" --json` (orphan approximation) as an informational-only annotation in the report, never a failure trigger.
4. Integrate issue creation via `gh issue create` if the lint/label checks fail and no open report issue exists; update the existing report issue's body on repeat failures instead of duplicating.
5. Provide local git hooks and global Dolt hook guidance for pre-push validation.

## Impact

- Enforces beads issue quality (missing sections, missing labels) automatically in CI, using commands that actually function in this repo's `direct`-mode bd database.
- Prevents convention drift without requiring manual developer audits.
- Drops the `bd doctor`/`bd preflight` dependency entirely; if this repo later moves to bd server mode, `bd doctor --check=conventions` could be reconsidered as a more thorough replacement (not scoped here).
- Report issues filed here live in GitHub Issues, a separate tracker from the bd/Dolt issue graph itself — a deliberate split (CI alerting needs a channel outside the thing being audited), not an accidental parallel system.
