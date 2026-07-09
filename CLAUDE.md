# Project instructions for AI agents

This file provides instructions and context for AI coding agents working on this project.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->

## Beads issue tracker

This project uses **bd (beads)** for issue tracking.
Run `bd prime` to see full workflow context and commands.

### Quick reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for issue and task tracking, alongside any existing user workflows.
- Run `bd prime` for detailed command reference and session close protocol.
- Use `bd remember` alongside the user's project/auto-memory (such as `MEMORY.md`).

## Session completion

**When ending a work session**, you MUST complete ALL steps below.
Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**

- Work is NOT complete until `git push` succeeds.
- NEVER stop before pushing - that leaves work stranded locally.
- NEVER say "ready to push when you are" - YOU must push.
- If push fails, resolve and retry until it succeeds.
<!-- END BEADS INTEGRATION -->

## Build & test

_Add your build and test commands here_

```bash
# Example:
# npm install
# npm test
```

## Architecture overview

_Add a brief overview of your project architecture_

## Conventions & patterns

_Add your project-specific conventions here_
