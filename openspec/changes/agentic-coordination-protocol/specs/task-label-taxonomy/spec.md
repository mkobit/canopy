## ADDED Requirements

### Requirement: Complexity labels classify all seeded tasks

Every task seeded into Beads from an OpenSpec change SHALL carry exactly one complexity label: `complexity:low`, `complexity:medium`, or `complexity:high`.
The seeding formula or script SHALL infer complexity from task content heuristics and MAY be overridden manually after seeding.

#### Scenario: Mechanical task gets low complexity

- **WHEN** a task title contains keywords indicating mechanical work (e.g., "bump", "update deps", "rename", "move file", "add label")
- **THEN** the seeded Beads issue SHALL carry `complexity:low`

#### Scenario: Design-gated task gets high complexity

- **WHEN** a task is marked `needs-design`
- **THEN** the seeded Beads issue SHALL carry `complexity:high`

#### Scenario: Unlabelled tasks default to medium

- **WHEN** a task does not match any heuristic pattern
- **THEN** the seeded Beads issue SHALL carry `complexity:medium`

### Requirement: Mechanical label identifies no-judgment tasks

Tasks that require zero design decisions SHALL carry the `mechanical` label in addition to their complexity label.
`mechanical` tasks are always `complexity:low`.

#### Scenario: Dependency bump is mechanical

- **WHEN** a task is seeded with title matching dependency update patterns
- **THEN** the Beads issue SHALL carry both `mechanical` and `complexity:low`

#### Scenario: Non-mechanical task omits the label

- **WHEN** a task requires any judgment or code decisions
- **THEN** the Beads issue SHALL NOT carry the `mechanical` label

### Requirement: needs-design label gates unclaimable tasks

Tasks that require a design document before implementation SHALL carry the `needs-design` label.
A `needs-design` task SHALL NOT be claimed by any agent until the label is manually removed.

#### Scenario: needs-design task absent from bd ready

- **WHEN** `bd ready` is run without explicit filter override
- **THEN** tasks carrying `needs-design` SHALL NOT appear in the results

#### Scenario: Label removed after design is complete

- **WHEN** a design document exists and the user removes `needs-design`
- **THEN** the task SHALL appear in `bd ready` results and be claimable

### Requirement: agent:jules label routes low-priority work to Jules

Tasks appropriate for Jules SHALL carry `agent:jules`.
These tasks SHALL be created at priority P3 or P4 so local agents encounter higher-priority tasks first via `bd ready`.
`agent:jules` is always paired with `complexity:low`.

#### Scenario: Jules-targeted tasks rank below local work

- **WHEN** both `agent:jules` tasks and unlabelled tasks are open
- **THEN** `bd ready` (sorted by priority) SHALL surface unlabelled tasks first

#### Scenario: Jules prompt filters to its slice

- **WHEN** a Jules prompt runs `bd ready` with `--filter agent:jules`
- **THEN** only `agent:jules` tasks SHALL appear in results
