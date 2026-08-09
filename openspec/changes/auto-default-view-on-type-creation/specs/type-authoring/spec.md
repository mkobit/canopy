## MODIFIED Requirements

### Requirement: NodeType, EdgeType, and PropertyType can be authored at runtime

The system SHALL provide `createNodeType`, `createEdgeType`, and `createPropertyType` ops, each a pure function returning `Result<{event, graph}, ValidationError>`, that create new type definition nodes in a specified non-restricted namespace.
On success, `createNodeType` SHALL additionally generate the default view artifacts defined by the `default-view-generation` capability (a `QueryDefinition`, a table `ViewDefinition`, and a `default_view` edge), and its successful result SHALL report these additional creations alongside the `NodeType` node.
`createEdgeType` and `createPropertyType` SHALL NOT generate default view artifacts.

#### Scenario: Creating a NodeType with inline and referenced properties

- **WHEN** `createNodeType` is called with a `properties` list containing both an inline property definition (`name`, `valueKind`, `required`) and a reference to an existing `PropertyType` node (`propertyTypeId`, `required`)
- **THEN** the system SHALL create the `NodeType` node with both property forms represented, and SHALL succeed

#### Scenario: Creating a NodeType also generates its default view

- **WHEN** `createNodeType` succeeds
- **THEN** the successful `Result` SHALL report, in addition to the `NodeType` node, a generated `QueryDefinition`, a table `ViewDefinition`, and a `default_view` edge linking the `NodeType` to that `ViewDefinition`

#### Scenario: Creating an EdgeType with best-effort source/target types

- **WHEN** `createEdgeType` is called with non-empty `sourceTypes` and `targetTypes` arrays
- **THEN** the system SHALL store them as metadata used for best-effort (warning-only) edge compatibility checks, consistent with existing `isEdgeCompatible` behavior, and SHALL NOT hard-reject edges that violate them
- **AND** the system SHALL NOT generate default view artifacts for the `EdgeType`

#### Scenario: Creating a PropertyType

- **WHEN** `createPropertyType` is called with a `name` and a `valueKind` that is a member of the existing `PropertyValueKind` union
- **THEN** the system SHALL create a `PropertyType` node with that `name` and `valueKind`, resolvable by `validatePropertyByType`

#### Scenario: Invalid valueKind is rejected

- **WHEN** `createPropertyType` is called with a `valueKind` that is not a member of the `PropertyValueKind` union
- **THEN** the system SHALL return a failed `Result` and SHALL NOT emit a `NodeCreated` event
