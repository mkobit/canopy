## ADDED Requirements

### Requirement: Agents discover work via bd ready with label filters

All agents SHALL use `bd ready` as the primary task discovery mechanism.
Agents SHALL apply label filters matching their capability profile — not claim tasks outside their profile.

#### Scenario: Local agent discovers medium and high complexity work

- **WHEN** a local interactive agent (Claude Code, Gemini CLI) runs task discovery
- **THEN** it SHALL query `bd ready` excluding `agent:jules` tasks
- **THEN** it SHALL prioritize `complexity:medium` and `complexity:high` tasks

#### Scenario: Jules discovers only its tagged slice

- **WHEN** a Jules session runs task discovery
- **THEN** it SHALL query `bd ready --filter agent:jules`
- **THEN** it SHALL only see `complexity:low` tasks tagged for Jules

#### Scenario: No matching tasks exits gracefully

- **WHEN** `bd ready` with the agent's filter returns no results
- **THEN** the agent SHALL exit without claiming or creating any issues

### Requirement: Claiming is atomic and idempotent

An agent SHALL claim a task using `bd update --claim` before beginning work.
`bd update --claim` is atomic — concurrent claims by multiple agents resolve to exactly one winner.
Claiming is idempotent if the same agent re-claims a task it already owns.

#### Scenario: Successful claim sets in-progress status

- **WHEN** an agent runs `bd update --claim <id>`
- **THEN** the issue status SHALL become `in_progress` and the assignee SHALL be set to the claiming agent

#### Scenario: Concurrent claim is safe

- **WHEN** two local agents attempt to claim the same task simultaneously
- **THEN** exactly one SHALL succeed and the other SHALL receive an error or see the task already claimed

### Requirement: Agents claim exactly one task per session

An agent session SHALL claim at most one task.
An agent SHALL complete or abandon the claimed task before ending its session.
This keeps PRs small and individually reviewable.

#### Scenario: Agent does not claim multiple tasks

- **WHEN** an agent has an active claim on a task
- **THEN** it SHALL NOT claim a second task in the same session

#### Scenario: Abandoned claim is released on session end

- **WHEN** an agent ends a session without completing the claimed task
- **THEN** the task SHALL be unclaimed (status reset to open) so another agent can pick it up

### Requirement: needs-design tasks trigger an OpenSpec escalation

When a local agent encounters a task labelled `needs-design` during exploration (not via `bd ready`), it SHALL initiate an OpenSpec explore or propose session rather than attempting implementation.

#### Scenario: Local agent escalates needs-design task

- **WHEN** a local agent identifies a task with `needs-design`
- **THEN** it SHALL NOT claim the task
- **THEN** it SHALL suggest running `/opsx:explore` or `/opsx:propose` to produce the required design
