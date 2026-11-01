## ADDED Requirements

### Requirement: Four orthogonal extensibility dimensions

The system SHALL decouple maintainer provenance, distribution mechanism, runtime isolation boundary, and granted authority as four independent dimensions.

#### Scenario: Maintainer origin does not grant runtime privilege

- **WHEN** a plugin is authored or maintained by first-party Canopy maintainers
- **THEN** the host SHALL NOT grant native host-process execution or ambient kernel authority to that plugin
- **AND** the plugin SHALL execute inside a sandboxed WebAssembly guest or worker isolate under least privilege

#### Scenario: Distribution mechanism does not grant authority

- **WHEN** a plugin is bundled directly into the application release binary
- **THEN** the host SHALL NOT grant wildcard capabilities or ambient write permissions based on distribution location

### Requirement: Four-tier system classification

Canopy components SHALL belong to one of four architectural tiers:
- Tier 0: Graph kernel primitives (`@canopy/graph`).
- Tier 1: System host services (`@canopy/plugin-host`, `@canopy/graph-access`, `@canopy/queries`, `@canopy/settings`).
- Tier 2: First-party extensions running as sandboxed WebAssembly guests.
- Tier 3: Third-party ecosystem extensions running under explicit capability grants.

#### Scenario: Kernel purity

- **WHEN** evaluating imports and runtime dependencies of Tier 0 `@canopy/graph`
- **THEN** `@canopy/graph` SHALL have zero dependencies on other `@canopy/*` packages, UI frameworks, network protocols, or WebAssembly execution runtimes

#### Scenario: Extension execution in sandbox

- **WHEN** an extension in Tier 2 or Tier 3 executes domain logic or custom rendering
- **THEN** the execution SHALL occur inside a sandboxed WebAssembly Component Model instance or terminable worker isolate
- **AND** all graph operations SHALL pass through host capability verification

### Requirement: Durable schema retention

When a plugin is uninstalled, disabled, or removed from a vault, the system SHALL retain all associated `NodeTypeDefinition` and `EdgeTypeDefinition` records in the graph.

#### Scenario: Querying nodes of an uninstalled plugin type

- **WHEN** a user uninstalls a plugin that previously registered custom node types
- **AND** queries are executed for nodes of those types
- **THEN** the query engine SHALL successfully return the matching nodes and properties without validation errors

#### Scenario: Replaying historical events after plugin removal

- **WHEN** the event log is replayed from genesis to reconstruct current graph state
- **AND** events reference types registered by a plugin that is no longer installed
- **THEN** the projection engine SHALL project the events successfully using the persisted type definitions

### Requirement: View resolution fallback cascade

When a required `RendererDefinition` is missing, uninstalled, disabled, or fails during execution, the host UI SHALL fall back to a safe default view.

#### Scenario: Missing custom renderer

- **WHEN** a view references a custom `RendererDefinition` that is not installed or active
- **THEN** the host UI SHALL display the node properties using the built-in generic property table
- **AND** the host SHALL NOT crash or produce an empty white-screen state

#### Scenario: Guest renderer execution failure

- **WHEN** an active guest renderer encounters an execution error, memory panic, or execution deadline timeout
- **THEN** the host UI SHALL display a structured error boundary banner
- **AND** the host UI SHALL offer a fallback button to inspect raw node properties

### Requirement: Explicit capability grants for sensitive scopes

Sensitive capabilities, including interactive script rendering (`render:interactive`), write operations, and network egress (`network:connect`), SHALL require explicit, literal capability strings.

#### Scenario: Wildcard token rejected for interactive render

- **WHEN** a plugin presents a capability token containing a wildcard grant such as `*` or `render:*`
- **AND** the plugin attempts to invoke an interactive iframe render requiring `render:interactive`
- **THEN** the capability verification check SHALL fail with permission denied

#### Scenario: Explicit literal grant accepted

- **WHEN** a plugin presents a capability token containing the exact string `render:interactive`
- **THEN** the capability verification check SHALL approve the interactive render request
