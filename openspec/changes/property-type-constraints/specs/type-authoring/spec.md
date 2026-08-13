# type-authoring Specification Delta

## MODIFIED Requirements

### Requirement: NodeType, EdgeType, and PropertyType can be authored at runtime

The system SHALL provide `createNodeType`, `createEdgeType`, and `createPropertyType` ops, each a pure function returning `Result<{event, graph}, ValidationError>`, that create new type definition nodes in a specified non-restricted namespace. `createPropertyType` SHALL support optional constraint declarations (`cardinality`, `choices`, `targetTypeId`, `regex`, `min`, `max`) and store them on the created `PropertyType` node.

#### Scenario: Creating a NodeType with inline and referenced properties

- **WHEN** `createNodeType` is called with a `properties` list containing both an inline property definition (`name`, `valueKind`, `required`) and a reference to an existing `PropertyType` node (`propertyTypeId`, `required`)
- **THEN** the system SHALL create the `NodeType` node with both property forms represented, and SHALL succeed

#### Scenario: Creating an EdgeType with best-effort source/target types

- **WHEN** `createEdgeType` is called with non-empty `sourceTypes` and `targetTypes` arrays
- **THEN** the system SHALL store them as metadata used for best-effort (warning-only) edge compatibility checks, consistent with existing `isEdgeCompatible` behavior, and SHALL NOT hard-reject edges that violate them

#### Scenario: Creating a PropertyType with optional constraints

- **WHEN** `createPropertyType` is called with a `name`, `valueKind`, and optional constraints (`cardinality`, `choices`, `targetTypeId`, `regex`, `min`, `max`)
- **THEN** the system SHALL create a `PropertyType` node persisting those constraints into node properties, resolvable by `validatePropertyByType` and `validateNode`

#### Scenario: Invalid valueKind is rejected

- **WHEN** `createPropertyType` is called with a `valueKind` that is not a member of the `PropertyValueKind` union
- **THEN** the system SHALL return a failed `Result` and SHALL NOT emit a `NodeCreated` event
