## ADDED Requirements

### Requirement: Draft overlay graph projection
The system SHALL support creating a draft session that overlays uncommitted events on top of a parent graph.

#### Scenario: Staging draft events
- **WHEN** a draft session receives a NodeCreated event
- **THEN** the draft session SHALL project a combined graph containing the new node while the parent graph remains unchanged

### Requirement: Commit staged draft events
The system SHALL allow committing staged events from a draft session directly to the parent session's persistent log.

#### Scenario: Commit changes
- **WHEN** the user commits a draft session containing staged events
- **THEN** the host SHALL append those events to the persistent event log and discard the draft session

### Requirement: Discard staged draft events
The system SHALL allow discarding a draft session, removing all uncommitted events.

#### Scenario: Discard changes
- **WHEN** the user discards a draft session
- **THEN** all uncommitted events SHALL be deleted and the parent graph SHALL remain unchanged
