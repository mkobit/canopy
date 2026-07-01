## ADDED Requirements

### Requirement: Schema section lists and creates namespaces
The web app SHALL provide a dedicated Schema section that lists existing namespaces (`name`, `kind`, `description`) and provides a form to create a new namespace via `createNamespace`.

#### Scenario: Restricted kind is not offered when creating a namespace
- **WHEN** a user opens the create-namespace form
- **THEN** the `kind` picker SHALL NOT offer `"system"` (or any other restricted kind) as a selectable value

#### Scenario: Namespace list reflects created namespaces
- **WHEN** a namespace has been created
- **THEN** it SHALL appear in the Schema section's namespace list without requiring a page reload

### Requirement: Schema section lists and creates NodeTypes, EdgeTypes, and PropertyTypes per namespace
For a selected non-restricted namespace, the Schema section SHALL list existing `NodeType`, `EdgeType`, and `PropertyType` definitions and provide create forms for each, wired to `createNodeType`, `createEdgeType`, and `createPropertyType` respectively.

#### Scenario: NodeType create form supports inline and referenced properties
- **WHEN** a user builds a NodeType's property list in the create form
- **THEN** each row SHALL be either an inline property (name, value-kind picker, required checkbox) or a reference to an existing `PropertyType` selected via search, and both kinds of rows SHALL be combinable in the same list

#### Scenario: EdgeType create form supports optional source/target type selection
- **WHEN** a user fills out the EdgeType create form
- **THEN** source and target NodeType selection SHALL be optional multi-selects, and leaving them empty SHALL be a valid submission (no source/target restriction)

#### Scenario: Restricted namespace blocks type creation in the UI
- **WHEN** a user attempts to submit a create form (NodeType/EdgeType/PropertyType/Namespace) targeting a restricted namespace
- **THEN** the UI SHALL block the submission or surface the op's failed `Result` as an error, and SHALL NOT show the new definition as created
