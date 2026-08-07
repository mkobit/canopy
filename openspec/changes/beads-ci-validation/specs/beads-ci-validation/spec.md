## ADDED Requirements

### Requirement: Automated beads issue convention checking in CI

The system SHALL run `bd doctor --check=conventions` and `bd preflight` validation checks in GitHub Actions CI workflows to maintain beads issue metadata integrity.

#### Scenario: GitHub Actions workflow execution

- **WHEN** a push occurs on the main branch or on scheduled Wednesday runs
- **THEN** the CI workflow SHALL execute `bd doctor --check=conventions` and `bd preflight` validation
- **AND** the workflow SHALL report any convention violations or orphan issues.

### Requirement: Automated audit failure issue reporting

The system SHALL automatically open a GitHub issue when beads validation checks fail in CI, preventing duplicate open reports.

#### Scenario: Validation failure report creation

- **WHEN** the beads CI validation workflow detects convention or preflight errors
- **THEN** it SHALL check for existing open `[Beads Audit Failure]` issues
- **AND** it SHALL create a new issue if no existing report issue is open.
