# Automation health check

Goal: review the health of the beads + openspec automation pipeline itself and surface problems.
Scope: read and report only. Do not create issues, modify prompts, or touch source code.

## Steps

1. Run `bd doctor` to check beads installation health. Note any warnings or errors.

2. Run `bd config show` and check for obviously wrong or missing config values.

3. Run `bd lint` to check issues for missing template sections.

4. Run `bunx openspec list` and `bunx openspec validate` on each in-progress change.
   Note any changes that are stale (no recent activity) or structurally invalid.

5. List the files in `.jules/prompts/` and check each prompt for:
   - Commands that no longer exist or have changed flags (run `bd --help` and `bunx openspec --help` to verify)
   - Steps that reference openspec changes or bd issues that no longer exist
   - Scope constraints that are too broad or too narrow given current workflow

6. Write a summary report to `.jules/automation-health-report.md` with:
   - Date of this run
   - bd doctor findings
   - Stale or invalid openspec changes
   - Prompt files that need updating and why
   - Any suggested config changes

## Constraints

- Do not modify prompt files, source code, openspec changes, or beads issues.
- Do not run `bd dolt push`.
- The report file is the only output artifact.
- One session only.
