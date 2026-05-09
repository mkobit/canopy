## ADDED Requirements

### Requirement: Jules prompts follow a two-phase structure

Every Jules prompt in `.jules/prompts/` that uses Beads for task discovery SHALL follow a two-phase structure:
1. **Discovery phase**: query `bd ready` with appropriate filters
2. **Execution phase**: claim one task, implement it, open a PR

Prompts that encode a direct task (no Beads lookup) MAY omit the discovery phase but SHALL still follow the single-task-per-session constraint.

#### Scenario: Discovery phase finds a claimable task

- **WHEN** Jules runs a Beads-discovery prompt and `bd ready --filter agent:jules` returns results
- **THEN** Jules SHALL claim the first result and proceed to the execution phase

#### Scenario: Discovery phase finds no tasks

- **WHEN** Jules runs a Beads-discovery prompt and `bd ready --filter agent:jules` returns no results
- **THEN** Jules SHALL exit the session without creating any issues or opening any PRs

### Requirement: Beads-discovery prompts are named with a beads- prefix

Prompt files that use `bd ready` for discovery SHALL be named `beads-*.md` in `.jules/prompts/`.
Direct-task prompts (no Beads lookup) SHALL keep their descriptive names without the prefix.

#### Scenario: Beads discovery prompt naming

- **WHEN** a new Jules prompt uses `bd ready` for task discovery
- **THEN** the file SHALL be named `.jules/prompts/beads-<description>.md`

#### Scenario: Direct task prompt naming

- **WHEN** a Jules prompt encodes a specific task directly (e.g., `backlog-pruner.md`)
- **THEN** the file SHALL NOT use the `beads-` prefix

### Requirement: Jules opens exactly one PR per session

A Jules session executing via a Beads-discovery prompt SHALL open at most one PR.
The PR SHALL include: the implementation diff, the Beads claim state (`.beads/` changes), and a reference to the claimed issue ID in the PR body.

#### Scenario: PR body references the claimed Beads issue

- **WHEN** Jules opens a PR after completing a claimed task
- **THEN** the PR body SHALL include the Beads issue ID (e.g., `Closes canopy-123`)

#### Scenario: Session with no claimable work opens no PR

- **WHEN** Jules finds no tasks in the discovery phase
- **THEN** Jules SHALL NOT open a PR

### Requirement: Jules prompt files are stored on main and versioned

All Jules prompt files SHALL live in `.jules/prompts/` on the `main` branch.
Jules reads them at session start from its checkout of `main`.
Changes to prompt files follow the normal PR workflow.

#### Scenario: Jules reads prompt from main checkout

- **WHEN** a scheduled Jules session starts
- **THEN** Jules SHALL read the prompt file from its fresh checkout of `main`
- **THEN** any prompt changes merged to `main` before the session will be picked up automatically
