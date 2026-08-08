## ADDED Requirements

### Requirement: Automated beads issue convention checking in CI

The system SHALL run `bd lint` (missing recommended sections, open issues only) and a `bd query` check for missing labels (`label=none AND status!=closed`) on a scheduled GitHub Actions workflow to maintain beads issue metadata integrity, using commands verified to function against this repo's `direct`-mode bd database (`bd doctor` is unavailable in this mode; see design.md). A separate `bd query` for parentless, non-epic issues (`parent=none AND type!=epic AND status!=closed`) SHALL be reported as informational only and SHALL NOT count as a failure.

#### Scenario: Scheduled GitHub Actions workflow execution

- **WHEN** the scheduled Wednesday run fires, or a `workflow_dispatch` is triggered manually
- **THEN** the CI workflow SHALL execute `bd lint`, `bd query "label=none AND status!=closed"`, and `bd query "parent=none AND type!=epic AND status!=closed"`
- **AND** the workflow SHALL report any missing sections or missing labels as failures, and any orphan-approximation matches as an informational-only section.

#### Scenario: Orphan check never causes a failure

- **WHEN** the orphan query (`parent=none AND type!=epic AND status!=closed`) matches one or more issues
- **THEN** the run is NOT marked as failed on that basis alone
- **AND** the report notes this is a "no parent, non-epic" approximation, not a full dependency-graph disconnection check

#### Scenario: Empty query results are not misread as findings

- **WHEN** a `bd query` check returns zero matching issues (JSON output `[]`)
- **THEN** the workflow SHALL treat this as zero findings for that check, based on the parsed result length, not the raw output string

### Requirement: Automated audit failure issue reporting

The system SHALL automatically open a GitHub issue when the lint or missing-label checks find violations in CI, preventing duplicate open reports.

#### Scenario: Validation failure report creation

- **WHEN** the beads CI validation workflow's lint or missing-label check finds one or more violations
- **THEN** it SHALL check for existing open `[Beads Audit Failure]` issues
- **AND** it SHALL create a new issue if no existing report issue is open
- **AND** it SHALL update the existing report issue's body with current findings if one is already open, instead of creating a duplicate

#### Scenario: Concurrent runs do not race into duplicate reports

- **WHEN** a scheduled run and a manually dispatched run overlap
- **THEN** the workflow's concurrency configuration SHALL serialize them so the check-then-create/update sequence cannot produce two report issues
