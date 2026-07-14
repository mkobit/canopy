## ADDED Requirements

### Requirement: Bootstrapped view and renderer definitions
The system SHALL seed default Renderer nodes, default ViewDefinition nodes, and setting schemas for view preferences during the bootstrap process.

#### Scenario: Verify bootstrapped rendering schema and defaults
- **WHEN** the system has bootstrapped a fresh graph
- **THEN** the settings schema `default-view` SHALL exist
- **AND** `Renderer` definitions for Text, Code, and Markdown SHALL exist
- **AND** `ViewDefinition` mappings for `TextBlock`, `CodeBlock`, and `MarkdownNode` SHALL exist

### Requirement: View resolution cascade
The system SHALL resolve a node's effective `ViewDefinition` as a functional `Result` by checking node-level overrides, user setting cascade, and node type default mappings in order.

#### Scenario: Resolving node-specific view override
- **WHEN** a node has an outbound `view_override` edge to a `ViewDefinition`
- **THEN** `resolveViewDefinition` SHALL return a successful `Result` carrying that specific `ViewDefinition` node

#### Scenario: Resolving via settings cascade fallback
- **WHEN** no node-specific override exists but a `default-view` UserSetting matches the node's scope
- **THEN** `resolveViewDefinition` SHALL return a successful `Result` carrying the `ViewDefinition` node referenced by the setting

#### Scenario: Resolving system default for type
- **WHEN** no custom overrides or settings exist for the node
- **THEN** `resolveViewDefinition` SHALL return a successful `Result` carrying the system-seeded default `ViewDefinition` associated with the node's type

#### Scenario: Failure to resolve view
- **WHEN** no view override, user setting, or default type mapping exists for the node
- **THEN** `resolveViewDefinition` SHALL return a failed `Result` with a description of the resolution failure

### Requirement: Component registry and dynamic dispatch
The web application SHALL register rendering components and dispatch node rendering dynamically using the resolved `ViewDefinition` and `Renderer` metadata.

#### Scenario: Successful component dispatch
- **WHEN** a node is rendered and resolves to a valid `ViewDefinition` referencing a `Renderer` with entry point `system:text`
- **THEN** the system SHALL render the node using the registered `TextBlockRenderer` component

#### Scenario: Generic fallback on resolution failure
- **WHEN** a node's type does not map to any registered renderer or resolution fails
- **THEN** the system SHALL render the node using a fallback representation showing its properties

### Requirement: Component delegation and cycle protection
The system SHALL expose a reusable rendering delegation component (such as `BlockRenderer`) that supports recursive child rendering and prevents rendering loops on cyclic graphs.

#### Scenario: Delegated child rendering resolves dynamically
- **WHEN** a container component delegates child rendering using `BlockRenderer`
- **THEN** the child node SHALL be resolved and rendered using its own dynamically resolved ViewDefinition and Renderer

#### Scenario: Prevent infinite loop on cyclic graph
- **WHEN** a node is encountered in the rendering tree that has already been visited
- **THEN** the system SHALL stop recursion and render a cycle warning instead of invoking the renderer
