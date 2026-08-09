## ADDED Requirements

### Requirement: Authoring a NodeType generates a default table view

When a `NodeType` is authored, the system SHALL generate a default `ViewDefinition` with `layout: "table"` whose `displayProperties` are the declared property names of that type, a backing `QueryDefinition` that scans nodes of the new type, and a `default_view` edge from the `NodeType` node to the generated `ViewDefinition`.
The generation SHALL occur as part of the successful `createNodeType` operation and SHALL emit the additional creations in the same result.

#### Scenario: Table view with one column per declared property

- **WHEN** `createNodeType` succeeds for a type declaring properties `["title", "status"]`
- **THEN** the system SHALL create a `ViewDefinition` node with `layout` equal to `"table"` and `displayProperties` equal to `["title", "status"]`
- **AND** SHALL create a `QueryDefinition` node whose stored definition scans nodes of the new type
- **AND** SHALL create a `default_view` edge whose source is the new `NodeType` node and whose target is the generated `ViewDefinition` node

#### Scenario: Generated view is resolvable via the default-views index

- **WHEN** a `NodeType` has been authored and its generated `default_view` edge has been projected
- **THEN** `resolveViewDefinition` for an instance of that type, with no override edge and no matching `default-view` setting, SHALL return a successful `Result` carrying the generated `ViewDefinition`

#### Scenario: Type with no declared properties still yields a resolvable view

- **WHEN** `createNodeType` succeeds for a type whose declared property list is empty
- **THEN** the system SHALL still create a `ViewDefinition` (with an empty `displayProperties` list), its backing `QueryDefinition`, and the `default_view` edge
- **AND** `resolveViewDefinition` for an instance of that type SHALL return that `ViewDefinition`

### Requirement: Generated definitions inhabit the authored type's namespace

The generated `ViewDefinition` and `QueryDefinition` SHALL be created in the same namespace as the authored `NodeType`, which is a non-restricted namespace by construction of `createNodeType`.
The system SHALL NOT write generated definitions into a restricted namespace.

#### Scenario: Generated definitions match the type's namespace

- **WHEN** `createNodeType` succeeds for a type in namespace `content`
- **THEN** the generated `ViewDefinition` and `QueryDefinition` nodes SHALL each carry `namespace` equal to `content`

### Requirement: Generated default view is overridable by the resolution cascade

The generated default view SHALL be the lowest-precedence resolution result: a node-level `view_override` edge and a matching `default-view` `UserSetting` SHALL both take precedence over the generated default, consistent with the existing view-resolution cascade order.

#### Scenario: Node-level override wins over the generated default

- **WHEN** a node of an authored type has an outbound `view_override` edge to a different `ViewDefinition`
- **THEN** `resolveViewDefinition` SHALL return the override target, not the generated default view

#### Scenario: Setting cascade wins over the generated default

- **WHEN** no `view_override` edge exists but a `default-view` `UserSetting` matches the node's scope
- **THEN** `resolveViewDefinition` SHALL return the `ViewDefinition` referenced by the setting, not the generated default view

### Requirement: Failed type authoring emits no generated definitions

When `createNodeType` fails validation, the system SHALL NOT emit any `ViewDefinition`, `QueryDefinition`, or `default_view` creation.

#### Scenario: Rejected type creation produces no view artifacts

- **WHEN** `createNodeType` is called with a duplicate type name and returns a failed `Result`
- **THEN** the system SHALL NOT emit a `ViewDefinition`, `QueryDefinition`, or `default_view` edge creation
