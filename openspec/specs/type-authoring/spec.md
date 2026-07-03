# type-authoring Specification

## Purpose
Let new `Namespace`, `NodeType`, `EdgeType`, and `PropertyType` definitions be created at runtime, without editing application code.
Namespace is a first-class, self-describing graph node (a 4th layer-1 metatype alongside `NodeType`/`EdgeType`/`PropertyType`) instead of a closed 4-value string enum, and a code-level restricted-kinds set governs which namespaces are protected from user writes.

## Requirements
### Requirement: Namespace is a first-class node type
The system SHALL represent namespaces as nodes of a self-describing `Namespace` metatype, with properties `name` (string, required, unique among non-deleted Namespace nodes), `description` (string, optional), and `kind` (string, required).

#### Scenario: Namespace node is queryable like any other node
- **WHEN** a `Namespace` node has been created
- **THEN** it SHALL be retrievable by querying nodes of type `Namespace`, the same way any other typed node is queried

#### Scenario: Duplicate namespace name is rejected
- **WHEN** `createNamespace` is called with a `name` that matches an existing non-deleted `Namespace` node
- **THEN** the system SHALL return a failed `Result` and SHALL NOT emit a `NodeCreated` event

### Requirement: Restricted namespace kinds cannot be created or written into via the public op
The system SHALL maintain a code-level set of restricted namespace kinds (initially `{"system"}`). `createNamespace` SHALL reject requests to create a namespace whose `kind` is in this set. `createNodeType`, `createEdgeType`, and `createPropertyType` SHALL reject requests targeting a namespace whose `kind` is in this set.

#### Scenario: Public op rejects creating a system-kind namespace
- **WHEN** `createNamespace` is called with `kind: "system"`
- **THEN** the system SHALL return a failed `Result` and SHALL NOT emit a `NodeCreated` event

#### Scenario: Public op rejects defining a type into a restricted namespace
- **WHEN** `createNodeType` (or `createEdgeType` or `createPropertyType`) is called with a `namespace` value that resolves to a `Namespace` node whose `kind` is restricted
- **THEN** the system SHALL return a failed `Result` and SHALL NOT emit a `NodeCreated` event

### Requirement: Existing namespaces are migrated to real Namespace nodes
The system SHALL, via a bootstrap migration event, create `Namespace` nodes for the 4 previously-hardcoded namespace values (`system`, `user`, `imported`, `user-settings`), with `system` classified under a restricted `kind` and the other 3 under a non-restricted `kind`.

#### Scenario: Migrated namespaces resolve correctly after migration
- **WHEN** the bootstrap migration has run
- **THEN** each of `system`, `user`, `imported`, `user-settings` SHALL resolve as a valid namespace via the same lookup path used for any namespace created after migration

#### Scenario: Namespace validity is checked against nodes, not a hardcoded list
- **WHEN** namespace validity is checked for any node's effective namespace
- **THEN** the system SHALL determine validity by looking up a non-deleted `Namespace` node with a matching `name`, with no separate hardcoded string-literal check remaining in the codebase

### Requirement: NodeType, EdgeType, and PropertyType can be authored at runtime
The system SHALL provide `createNodeType`, `createEdgeType`, and `createPropertyType` ops, each a pure function returning `Result<{event, graph}, ValidationError>`, that create new type definition nodes in a specified non-restricted namespace.

#### Scenario: Creating a NodeType with inline and referenced properties
- **WHEN** `createNodeType` is called with a `properties` list containing both an inline property definition (`name`, `valueKind`, `required`) and a reference to an existing `PropertyType` node (`propertyTypeId`, `required`)
- **THEN** the system SHALL create the `NodeType` node with both property forms represented, and SHALL succeed

#### Scenario: Creating an EdgeType with best-effort source/target types
- **WHEN** `createEdgeType` is called with non-empty `sourceTypes` and `targetTypes` arrays
- **THEN** the system SHALL store them as metadata used for best-effort (warning-only) edge compatibility checks, consistent with existing `isEdgeCompatible` behavior, and SHALL NOT hard-reject edges that violate them

#### Scenario: Creating a PropertyType
- **WHEN** `createPropertyType` is called with a `name` and a `valueKind` that is a member of the existing `PropertyValueKind` union
- **THEN** the system SHALL create a `PropertyType` node with that `name` and `valueKind`, resolvable by `validatePropertyByType`

#### Scenario: Invalid valueKind is rejected
- **WHEN** `createPropertyType` is called with a `valueKind` that is not a member of the `PropertyValueKind` union
- **THEN** the system SHALL return a failed `Result` and SHALL NOT emit a `NodeCreated` event

### Requirement: Type and namespace definitions are create-only
The system SHALL NOT provide update or delete operations for `Namespace`, `NodeType`, `EdgeType`, or `PropertyType` definition nodes through this control plane.

#### Scenario: No edit path exists for an existing definition
- **WHEN** a `Namespace`, `NodeType`, `EdgeType`, or `PropertyType` node already exists
- **THEN** the only way to introduce different structure is creating a new definition node; no op in this capability modifies an existing definition node's properties

