## ADDED Requirements

### Requirement: Block text is edited as an event-sourced property
The `apps/web` block editor SHALL edit a node's plain-string `text` property via local component state and SHALL commit changes as `NodePropertiesUpdated` events through the graph session.
The editor SHALL NOT use a CRDT text type or CRDT library.

#### Scenario: Edit round-trips through the event log
- **WHEN** the user edits a block's text and the commit fires
- **THEN** a `NodePropertiesUpdated` event for the `text` property SHALL be appended to the event log, and reloading the graph SHALL show the edited text

### Requirement: Text commits are debounced, not per-keystroke
The editor SHALL coalesce keystrokes and commit on idle (approximately 1 second), on blur, and on navigation away from the node.

#### Scenario: Continuous typing produces one event per pause
- **WHEN** the user types continuously and then pauses past the idle threshold
- **THEN** exactly one `NodePropertiesUpdated` event SHALL be committed for the typed span

#### Scenario: Navigation flushes pending edits
- **WHEN** the user navigates away from a node with uncommitted text changes
- **THEN** the pending changes SHALL be committed before the editor unmounts

### Requirement: Short-term undo is a local editor concern
Undo/redo within an editing session SHALL be handled locally by the editor (browser-native behavior is acceptable) and SHALL NOT depend on a CRDT undo manager.

#### Scenario: Undo works within an editing session
- **WHEN** the user types in a block and triggers undo before navigating away
- **THEN** the editor SHALL revert the local text, and the subsequent debounced commit SHALL reflect the reverted content
