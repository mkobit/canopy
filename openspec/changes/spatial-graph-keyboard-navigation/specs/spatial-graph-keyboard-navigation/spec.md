## ADDED Requirements

### Requirement: Spatial keyboard navigation across graph nodes

The system SHALL support directional arrow key spatial navigation (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) to focus the visually closest neighbor node in `InteractiveGraphView` and `GraphCanvas`.

#### Scenario: Pressing arrow key navigates to visually adjacent node

- **GIVEN** a graph view with multiple nodes positioned in 2D layout space and an active focused/selected node
- **WHEN** the user presses an arrow key (`ArrowUp`, `ArrowDown`, `ArrowLeft`, or `ArrowRight`)
- **THEN** the focus SHALL move to the visually closest node in that directional hemisphere.

### Requirement: Keyboard selection dismissal and node focusability

The system SHALL support standard focusability (`tabIndex={0}`) with visible focus indicators and node selection dismissal via `Escape`.

#### Scenario: Pressing Escape deselects current node

- **GIVEN** an active selected node in a graph view
- **WHEN** the user presses `Escape`
- **THEN** the active node selection SHALL be cleared.

#### Scenario: Nodes have standard tabIndex and focus styles

- **WHEN** graph nodes are rendered in `InteractiveGraphView` or `GraphCanvas`
- **THEN** node container elements SHALL have `tabIndex={0}` and visible focus ring styles (`focus-visible:ring-2`).
