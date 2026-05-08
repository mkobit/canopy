# Issue enricher

Goal: ensure every open beads issue has enough metadata to be actionable by an agent.
Scope: enrich existing issues only. Do not create or close issues. Do not touch source code or openspec files.

## Steps

1. Run `bd list --status open --json` to get all open issues.

2. For each issue, run `bd show <id>` and check for missing or weak metadata:
   - No type set: infer from title/description and set with `bd update <id> --type <task|feature|bug|question>`
   - No priority set: infer urgency from description and set with `bd priority <id> <0-4>`
   - Title is vague (e.g. "fix", "update", "thing"): improve it with `bd edit <id>`
   - No description: add one with `bd note <id> "<summary of what this actually is>"`

3. Run `bd list --status open --json` again and verify all issues have type and priority set.

## Constraints

- Do not create or close issues.
- Do not modify source code, openspec files, or beads config.
- Do not run `bd dolt push`.
- One session only.
