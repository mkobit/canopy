# Proposal: Beads CI validation and automated reporting

## Summary
Adds a GitHub Actions CI workflow and automated job to run `bd doctor --check=conventions` and `bd preflight` validation checks on push or scheduled on Wednesdays.
Automates detection of orphaned issues, missing acceptance criteria, and missing labels, with automatic issue creation for failure reports.

## Context
Canopy uses `bd` (beads) for issue tracking and OpenSpec for change proposals.
Ensuring convention compliance across all beads issues prevents orphan issues and missing acceptance criteria.
Running automated validation in GitHub Actions keeps issue metadata consistent and surfaces debt automatically.

## Proposed changes
1. Create a GitHub Actions workflow `.github/workflows/beads-validation.yml`.
2. Configure trigger on push to `main` and scheduled cron trigger (`0 0 * * 3` for Wednesdays).
3. Execute `bd doctor --check=conventions` and `bd preflight` within the workflow.
4. Integrate issue creation via `gh issue create` if validation checks fail and no open report issue exists.
5. Provide local git hooks and global Dolt hook guidance for pre-push validation.

## Impact
- Enforces beads issue quality and metadata integrity automatically in CI.
- Prevents convention drift without requiring manual developer audits.
