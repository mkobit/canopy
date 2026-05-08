# OpenSpec housekeeping

Goal: keep the openspec changes directory tidy. Archive completed changes and validate in-progress ones.
Scope: read and archive/validate existing openspec changes only. Do not propose new changes. Do not modify source code.

## Steps

1. Run `bunx openspec list` to see all current changes and their status.

2. For each change marked as complete or where all tasks are done:
   Run `bunx openspec status --change <name>` to confirm.
   If fully complete, archive it:
   `bunx openspec archive <name>`

3. For each change still in progress:
   Run `bunx openspec status --change <name>` to check which artifacts are missing or stale.
   Run `bunx openspec validate <name>` to catch any structural issues.
   If a change has been abandoned (no linked beads issues open, no recent git activity), note it in a comment but do not archive without confirmation.

4. Run `bunx openspec list` again at the end to confirm the directory is clean.

## Constraints

- Do not run `bunx openspec new` or `bunx openspec change` to create anything new.
- Do not modify source code files.
- Do not close or create beads issues.
- One session only: stop after completing the steps above.
