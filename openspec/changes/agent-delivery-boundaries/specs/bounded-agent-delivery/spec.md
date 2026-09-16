## ADDED Requirements

### Requirement: Approval before implementation task staging

The planner SHALL NOT create `tasks.md` or implementation Beads tasks until the corresponding design has completed adversarial review and its mitigations have been approved through the merged design PR.

#### Scenario: Artifacts exist but approval is pending

- **WHEN** proposal, design, and specification artifacts exist but maintainer approval is pending
- **THEN** the planner SHALL withhold implementation task staging even if the tooling reports the tasks artifact as available

### Requirement: Approved contract before implementation dispatch

The integration owner SHALL dispatch an implementation slice only after its design has passed adversarial review, approval is evidenced by the merged design PR, and the slice has explicit ownership, dependencies, acceptance scenarios, and a pinned contract revision.

#### Scenario: Unresolved domain choice

- **WHEN** a proposed slice requires choosing staging graph semantics or another unapproved domain contract
- **THEN** it SHALL remain design work and SHALL NOT be dispatched as implementation

#### Scenario: Ready issue without approval evidence

- **WHEN** a Beads issue appears in ready output but its required approval evidence is missing
- **THEN** the dispatcher SHALL withhold implementation assignment

#### Scenario: Structural validation passes

- **WHEN** OpenSpec validates a change's artifact structure without checking maintainer approval
- **THEN** the dispatcher SHALL still independently check merged approval evidence before implementation dispatch

### Requirement: Bounded ownership and context

Each implementation packet SHALL identify its outcome, approved requirements, base revision, provided and consumed contracts, editable scope, reserved shared files, isolation, integration owner, review route, and verified acceptance checks.
It SHALL specify the authoritative claim mode and who may update issues, commit, push, create a PR, merge, and close the task.

#### Scenario: Remote execution without authoritative Beads access

- **WHEN** a worker executes remotely without access to the authoritative Beads database
- **THEN** the dispatcher SHALL claim the approved task locally and supply the full packet in the authorized prompt
- **AND** the worker SHALL return evidence without using a copied database to claim ownership or close the task

#### Scenario: Incomplete packet

- **WHEN** a packet has unresolved placeholders or no observable acceptance evidence
- **THEN** it SHALL be returned to preparation before an implementation agent claims it

#### Scenario: Parallel workers

- **WHEN** two workers are dispatched concurrently
- **THEN** their write scopes SHALL be non-overlapping and their consumed contracts SHALL be compatible with the pinned baseline
- **AND** shared generated files and manifests SHALL have one designated writer

### Requirement: Contract evolution through the owning context

A worker requiring an unapproved observable contract change SHALL report it to the integration owner and stop the dependent work.
The owner SHALL revise the affected design and acceptance scenarios, obtain required approval, and update affected packets before dependent implementation resumes.

#### Scenario: Compatible internal refinement

- **WHEN** a context changes its internals without changing its approved observable contracts
- **THEN** unrelated contexts SHALL NOT require redesign solely because of that internal change

#### Scenario: Contract changed during execution

- **WHEN** a packet's pinned contract is superseded while a worker is executing
- **THEN** the integration owner SHALL identify affected work and update or withdraw its packet
- **AND** the worker's output SHALL be checked against the approved replacement before integration

#### Scenario: Evidence predates a material contract or baseline change

- **WHEN** a contract or integration baseline changes materially after checks or review
- **THEN** prior evidence and review approval for affected scenarios SHALL be considered stale
- **AND** affected checks and independent review SHALL be renewed against the resulting revision before integration

### Requirement: Coupled integration precedes independent work

The integration owner SHALL retain coupled contract and consumer changes as one owned slice until a building contract baseline permits disjoint work.

#### Scenario: Shared export moves between packages

- **WHEN** an extraction changes shared exports and several consumers cannot build independently during the move
- **THEN** one integration owner SHALL own that coupled transition before dispatching independent follow-up slices

### Requirement: Boundary evidence and independent acceptance

The worker SHALL return revision identity, changed files, scenario evidence, check outcomes, and unresolved concerns.
An independent reviewer SHALL assess conformity to approved contracts, and the integration owner SHALL verify the combined result using the applicable integration/performance checks and full repository quality gate before landing implementation.

#### Scenario: Stub success without real boundary evidence

- **WHEN** a persistence, protocol, or isolation change passes stub tests but lacks evidence for its affected real boundary
- **THEN** the reviewer SHALL report the acceptance gap rather than certify the slice as integrated

#### Scenario: Worker reports success

- **WHEN** a worker returns passing local checks
- **THEN** the report SHALL NOT itself authorize merge, publication, or issue closure
- **AND** the assigned integration and repository approval rules SHALL still apply

#### Scenario: Publication action is not assigned

- **WHEN** a worker completes implementation but its packet does not authorize a push, PR, merge, or issue update
- **THEN** it SHALL return its evidence without performing the unassigned action
