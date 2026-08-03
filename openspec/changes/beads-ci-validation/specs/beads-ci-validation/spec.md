# Capability: Beads CI Validation

## ADDED Requirements

### Requirement: Validate Beads Issue Tracker State in CI

CI pipelines MUST validate that beads issue tracker constraints and conventions are strictly enforced prior to PR merge.

#### Scenario: CI runs beads validation gate

- **Given** a pull request branch target
- **When** the CI workflow executes
- **Then** `bd doctor --check=conventions` and `bd preflight` execute and pass cleanly.
