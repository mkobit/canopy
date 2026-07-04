## ADDED Requirements

### Requirement: GraphSession is the single write path
`@canopy/graph` SHALL provide a `GraphSession` created over an `EventLogStore`, a graph ID, and a device ID, exposing load, commit, current-graph read, and change subscription.
Every graph mutation SHALL flow commit → validation → event log append → incremental projection → subscriber notification; no consumer SHALL mutate graph state outside this pipeline.

#### Scenario: Committing op events updates the projected graph and notifies subscribers
- **WHEN** a session commits the events produced by a `@canopy/graph` op
- **THEN** the events SHALL be validated, appended to the `EventLogStore`, merged into the projected `Graph`, and subscribers SHALL be notified once with the updated graph and the applied-event delta

### Requirement: Change notifications carry the applied delta
Subscriber notifications SHALL include the events applied in that merge (the delta) alongside the updated `Graph`, so consumers (live queries, reactive views) can refresh incrementally without re-scanning graph state.
Events parked in the pending buffer SHALL NOT appear in a delta until they are actually applied.

#### Scenario: Remote ingest notifies with only the applied events
- **WHEN** a batch of remote events is ingested and some are parked pending a missing dependency
- **THEN** the notification's delta SHALL contain exactly the applied events, and a later notification SHALL carry the parked events once they drain

### Requirement: Committed events carry a real device identity
Events committed through a session SHALL be stamped with the deviceId the session was created with, and applications SHALL provision a stable per-installation deviceId — the zero/placeholder deviceId SHALL NOT appear in persisted events.

#### Scenario: Device identity survives restart
- **WHEN** the web app is reloaded and commits a new event
- **THEN** the event's deviceId SHALL equal the deviceId used before the reload

#### Scenario: Two devices produce distinguishable events
- **WHEN** sessions on two installations commit events
- **THEN** the events SHALL carry different deviceIds, giving LWW a deterministic tiebreak

#### Scenario: Invalid events never reach the log
- **WHEN** a commit contains an event that fails structural, referential, type, or namespace validation
- **THEN** the session SHALL return a failed `Result`, SHALL NOT append any event from that commit, and the projected graph SHALL be unchanged

#### Scenario: Loading a session projects the persisted log
- **WHEN** a session loads a graph whose event log contains previously appended events
- **THEN** the projected `Graph` SHALL equal `projectGraph` over those events sorted by eventId

### Requirement: Incremental projection converges under any delivery order
Incremental projection SHALL satisfy the convergence invariant: applying any permutation of any subset of events SHALL produce the same graph state as sorting those events by eventId and folding in order.
The implementation SHALL track, per entity per property, the eventId of the last applied write (property removals included), apply a write iff its eventId is greater, treat edge creation as additive keyed by EdgeId, and treat deletion as a permanent idempotent tombstone.

#### Scenario: Late-arriving older write loses
- **WHEN** a `NodePropertiesUpdated` event arrives whose eventId is lower than the recorded last-writer eventId for that property
- **THEN** the property value SHALL be unchanged and the event SHALL remain in the log

#### Scenario: Permutation invariance holds under property-based testing
- **WHEN** a generated set of events from multiple simulated devices is applied incrementally in a random permutation
- **THEN** the resulting graph state SHALL equal the ordered fold of the same events, for all generated cases

#### Scenario: Update to a tombstoned node is a projection no-op
- **WHEN** a property update arrives for a node that has a tombstone, regardless of the update's eventId
- **THEN** the projected node SHALL remain deleted and the event SHALL remain in the log

### Requirement: Events with unsatisfied dependencies park in a pending buffer
Projection SHALL park events whose references are not yet satisfied or whose batch is incomplete, keyed by the missing dependency, and SHALL drain them when the dependency arrives.
Parked events past an age threshold SHALL surface as warnings, not errors.

#### Scenario: Edge arriving before its endpoint is parked then applied
- **WHEN** an `EdgeCreated` event arrives before the `NodeCreated` event for one of its endpoints, and that `NodeCreated` arrives later
- **THEN** the edge SHALL NOT appear in the projected graph until the endpoint exists, and SHALL appear after it does

#### Scenario: Incomplete batch is withheld from projection
- **WHEN** only part of a set of events sharing a batchId has arrived
- **THEN** none of the batch's events SHALL be applied to the projected graph until the batch is complete
