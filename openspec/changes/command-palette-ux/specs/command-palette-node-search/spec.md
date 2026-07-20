## ADDED Requirements

### Requirement: Search graph nodes in command palette

The system SHALL support searching all graph nodes by ID and name properties when the palette is in Node Search Mode.

#### Scenario: Querying nodes

- **WHEN** the user types a query in Node Search Mode
- **THEN** the system SHALL execute the query to fetch all nodes and filter the list by checking if the node ID or name property contains the query.

### Requirement: Navigate to selected node

The system SHALL navigate to the selected node route in the router when a node is chosen.

#### Scenario: Confirming node selection

- **WHEN** the user selects a node from the search results and confirms the selection
- **THEN** the system SHALL close the command palette and navigate the router to the route `/graph/:graphId/node/:nodeId`.
