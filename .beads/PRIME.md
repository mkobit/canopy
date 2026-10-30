# Beads Workflow Context

> **Context Recovery**: Run `bd prime` after compaction, clear, or a new session.
> Hooks auto-call this in supported agent hosts when a Beads workspace is resolved.

# 🚨 SESSION CLOSE PROTOCOL 🚨

**CRITICAL**: Before saying "done" or "complete", follow the authority assigned for this work and run this checklist:

```text
[ ] 1. run quality gates        (tests, linters, builds when relevant)
[ ] 2. git status               (review the exact repository state)
[ ] 3. begin the normal Git publication flow when the work is ready
[ ] 4. request or obtain host approval for each action the host gates
[ ] 5. report the handoff, publication state, and any actions still awaiting approval
```

Agents generally may begin the normal Git workflow when work is ready. Permission to begin that workflow is distinct from approval to perform a host-gated action. Treat commit, push, PR creation, merge, and Beads closure as separate authorities; request or obtain host approval wherever the active host gates an action. Do not infer merge, issue closure, destructive Git, or external-publication authority from permission to prepare or begin the workflow.

An explicit task or handoff packet may narrow any of these authorities and overrides this general default. Follow repository guidance and the approved bounded-delivery contract as well as the active user, orchestrator, and host rules.

## Core Rules

- **Default**: Use Beads for all task tracking (`bd create`, `bd ready`, `bd close`).
- **Prohibited**: Do not use TodoWrite, TaskCreate, or Markdown files for task tracking.
- **Workflow**: Create a Beads issue before writing code and use `bd update <id> --claim` when taking unassigned work.
- **Memory**: Use `bd remember "insight"` for persistent knowledge across sessions. Do not use `MEMORY.md` files; search with `bd memories <keyword>`.
- Persistence you do not need beats lost context.
- **Git workflow**: Agents may begin the normal Git flow when work is ready. Host approval remains the gate for any action the host gates.
- **Action-specific authority**: Commit, push, PR creation, merge, and issue closure are distinct. Explicit packet restrictions override the general default; no blanket merge, closure, destructive Git, or external-publication authority is granted.
- **Delivery boundary**: This guidance does not implement or pre-empt the sbx-first migration owned by `canopy-kn7`.
- **Session management**: Check `bd ready` for available work.
- **High-reasoning label**: Beads tagged `high-reasoning` require deep architectural modeling and adversarial analysis. In AGY (Antigravity), delegate design exploration, WIT modeling, and adversarial reviews to an Argon (`pro`) subagent while root coordinates on Flash. In Codex and Claude Code, select a high-reasoning model or specialist subagent. Do not stage or claim implementation tasks until an OpenSpec design proposal passes adversarial review.

## Essential Commands

### Finding Work

- `bd ready` - Show issues ready to work (no blockers).
- `bd list --status=open` - Show all open issues.
- `bd list --status=in_progress` - Show active work.
- `bd show <id>` - Show an issue and its dependencies.

### Creating and Updating

- `bd create --title="Summary" --description="Why this exists and what is needed" --type=task|bug|feature --priority=2` - Create an issue.
- `bd create ... --parent=<id>` - Create a child issue.
- `bd update <id> --claim` - Atomically claim work.
- `bd unclaim <id>` - Release a stuck claim.
- `bd update <id> --assignee=username` - Assign work.
- `bd update <id> --if-assignee=<expected> --assignee=<new>` - Atomically reassign only if the current assignee matches.
- `bd update <id> --title/--description/--notes/--design` - Update issue fields inline.
- `bd close <id>` - Close an issue only when closure authority is assigned and acceptance is complete.
- Do not use `bd edit`; it opens an interactive editor that blocks agents.

### Dependencies and Blocking

- `bd dep add <issue> <depends-on>` - Add a dependency.
- `bd blocked` - Show blocked issues.
- `bd show <id>` - Inspect what blocks or is blocked by an issue.

### Project Health and Validation

- `bd stats` - Show project statistics.
- `bd doctor` - Check repository and synchronization health.
- `bd doctor --check=conventions` - Check convention drift.
- `bd lint` - Check issue quality.
- `bd preflight` - Run pre-publication Beads checks.

## Common Workflows

**Starting work:**

```bash
bd ready
bd show <id>
bd update <id> --claim
```

**Working on `high-reasoning` issues:**

```bash
bd list --label high-reasoning
bd show <id>
```

- In AGY: Delegate architectural design, WIT modeling, and adversarial reviews to an Argon (`pro`) subagent. Keep root on Flash.
- In Codex and Claude Code: Use high-reasoning models or dedicated reasoning subagents.
- Complete the OpenSpec design proposal and adversarial review before creating or claiming implementation tasks.

**Completing work:**

```bash
# Run the applicable quality gates first.
git status
# Begin the normal Git flow. Obtain host approval at each gated action.
# Commit, push, PR, merge, and closure remain independently authorized.
```

If a task packet reserves publication or issue updates to an integration owner, return the required evidence without performing those reserved actions.
