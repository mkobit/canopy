# Backlog pruner

Goal: clean up the beads backlog so `bd ready` reflects only actionable, current work.
Scope: read and close/defer existing issues only. Do not create new issues. Do not touch source code or openspec files.

## Steps

1. Run `bd status` to get an overview of the database.

2. Run `bd stale` to find issues not updated recently.
   For each stale issue: read it with `bd show <id>`.
   If it is blocked indefinitely, superseded, or no longer relevant, close it:
   `bd close <id> --reason "<why>"`
   If it is still valid but not urgent, defer it:
   `bd defer <id>`

3. Run `bd find-duplicates` and resolve any duplicates found:
   `bd duplicate <duplicate-id> <canonical-id>`

4. Run `bd list --status open` and scan for issues that are vague, untitled, or have no description.
   Close these with reason "too vague to action" or improve the title/description with `bd edit <id>`.

5. Run `bd ready` at the end to confirm the remaining backlog is clean and unblocked.

## Constraints

- Do not open new issues.
- Do not modify any files outside `.beads/`.
- Do not run `bd dolt push` — leave that for the maintainer.
- One session only: stop after completing the steps above.

## Delivery boundary

Read [Jules guidance](../AGENTS.md) before pruning issues.
Evaluate relevance against linked contracts and product intent; an unresolved design question is not obsolete merely because it is not ready for implementation.
`bd ready` reports dependency readiness, not design approval or permission to dispatch implementation.
Pruning retains the maintenance authority above and grants no implementation authority.
