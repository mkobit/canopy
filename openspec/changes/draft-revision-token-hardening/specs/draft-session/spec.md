## MODIFIED Requirements

### Requirement: Commit staged draft events with revision check

The system SHALL allow committing staged events from a draft session directly to the parent session's persistent log only if the parent graph revision matches the expected revision.
The revision token SHALL be derived from graph state such that any two distinct states produce distinct tokens: specifically, two parent commits that occur within the same wall-clock millisecond SHALL still advance the revision, and a draft holding a pre-commit revision SHALL be rejected.
The revision token SHALL remain an opaque string across the draft API and JSON-RPC wire contract, and the derivation SHALL preserve incremental projection's permutation-invariance guarantee (the token is a running maximum over globally unique applied event identifiers, so it converges to the same value regardless of event delivery order).

#### Scenario: Successful commit with matching revision

- **WHEN** the user commits a draft session and the current parent graph revision matches the expected revision
- **THEN** the host SHALL append those events to the persistent event log and discard the draft session

#### Scenario: Rejected commit with stale revision

- **WHEN** the user commits a draft session but the parent graph revision has changed concurrently
- **THEN** the host SHALL reject the commit, return a concurrent-modification error, and keep the draft session active

#### Scenario: Same-millisecond concurrent commit is not a false match

- **WHEN** a draft captures the parent revision, a second commit lands on the parent within the same wall-clock millisecond, and the draft then commits with its captured expected revision
- **THEN** the current parent revision SHALL differ from the captured expected revision, and the commit SHALL be rejected with a concurrent-modification error

#### Scenario: Revision is order-independent

- **WHEN** the same set of events is projected in different delivery orders
- **THEN** the resulting parent revision token SHALL be identical across those orders
