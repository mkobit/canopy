## ADDED Requirements

### Requirement: Seeding is a deliberate user-triggered handoff

Converting an OpenSpec `tasks.md` to a Beads issue graph SHALL require an explicit user action — it is never automatic.
The user reviews and approves `tasks.md` before seeding.
Seeding marks the boundary between planning and execution.

#### Scenario: User triggers seeding after approving tasks.md

- **WHEN** the user runs the seeding command for a completed OpenSpec change
- **THEN** Beads issues are created matching the tasks.md structure

#### Scenario: Agents do not seed

- **WHEN** an agent (Jules or local) encounters an unseeded OpenSpec change
- **THEN** the agent SHALL NOT create Beads issues from it autonomously

### Requirement: mol-openspec-change formula encodes the seeding pattern

A reusable Beads formula at `.beads/formulas/mol-openspec-change.formula.yaml` SHALL define the standard seeding template for OpenSpec changes.
The formula SHALL accept `change_name` as a required variable and produce an epic with child tasks mirroring the tasks.md group structure.

#### Scenario: Formula instantiation creates correctly structured issues

- **WHEN** `bd mol pour mol-openspec-change --var change_name=<name>` is run
- **THEN** a Beads epic SHALL be created with child issues corresponding to each task group in the change's tasks.md

#### Scenario: Dry-run previews without creating issues

- **WHEN** `bd mol pour mol-openspec-change --var change_name=<name> --dry-run` is run
- **THEN** the command SHALL output the planned issue structure without writing to the database

### Requirement: Seeded issues carry taxonomy labels

Every issue created by the seeding formula SHALL carry the appropriate labels from the task label taxonomy (`complexity:*`, `mechanical`, `needs-design`, `agent:jules`) based on content heuristics.

#### Scenario: Group epic inherits change name as label

- **WHEN** issues are seeded from change `functional-guardrails`
- **THEN** all seeded issues SHALL carry a label linking them to the originating change (e.g., `change:functional-guardrails`)

#### Scenario: Task-level labels are inferred at seed time

- **WHEN** a task title matches a mechanical heuristic pattern
- **THEN** the seeded issue SHALL carry `complexity:low`, `mechanical`, and `agent:jules`

### Requirement: spec-id links seeded issues to OpenSpec artifacts

The root epic created by seeding SHALL carry a `--spec-id` referencing the OpenSpec change path.
Individual task issues MAY carry a `--spec-id` referencing the specific spec file they implement.

#### Scenario: Epic spec-id is set to change path

- **WHEN** seeding creates the root epic for change `functional-guardrails`
- **THEN** the epic's `spec_id` SHALL be `openspec/changes/functional-guardrails`
