## MODIFIED Requirements

### Requirement: Component registry and dynamic dispatch

The web application SHALL register rendering components and dispatch node rendering dynamically using the resolved `ViewDefinition` and `Renderer` metadata.
`Renderer` denotes the graph-resident renderer definition referenced by a `ViewDefinition`; historical `RendererDefinition` wording SHALL NOT imply a separate graph node type.
The application SHALL dispatch `rendererKind: 'system'` renderers to registered native components and `rendererKind: 'wasm'` renderers to sandboxed plugin execution.
For WASM renderers, tier selection SHALL follow the effective-grant requirements in content-rendering-plugin, including an explicit non-wildcard host grant for `render:interactive`; manifest declaration alone SHALL NOT authorize Tier 2.

#### Scenario: Successful component dispatch

- **WHEN** a node resolves to a `Renderer` with `rendererKind: 'system'` and entry point `system:text`
- **THEN** the system SHALL render the node using the registered `TextBlockRenderer` component

#### Scenario: Successful wasm renderer dispatch

- **WHEN** a node resolves to a `Renderer` with `rendererKind: 'wasm'` whose effective render scope permits `render:raw-html` without an explicit effective `render:interactive` grant
- **THEN** the system SHALL execute the supported referenced plugin and render its sanitized output through the Tier-1 inline path

#### Scenario: Interactive wasm renderer dispatches to Tier 2

- **WHEN** a node resolves to a `Renderer` with `rendererKind: 'wasm'` whose manifest permits `render:interactive`, whose host scope explicitly grants `render:interactive`, and whose required guest executable and worker execution path are available
- **THEN** the system SHALL render its output through the Tier-2 sandboxed-iframe engine rather than the Tier-1 inline path
- **AND** an additional effective `render:raw-html` capability SHALL NOT change that tier

#### Scenario: Declaration alone does not authorize interactive rendering

- **WHEN** a plugin declares `render:interactive` but its host scope contains no explicit `render:interactive` grant
- **THEN** the system SHALL NOT authorize Tier-2 rendering from that declaration
- **AND** a wildcard-only host grant such as `render:*` or `*` SHALL NOT satisfy the explicit-grant requirement

#### Scenario: Generic fallback on resolution failure

- **WHEN** a node's type does not map to any renderer, resolution fails, or `wasm` renderer execution fails or is terminated, except for the unavailable interactive renderer case below
- **THEN** the system SHALL render the node using a fallback representation showing its properties

#### Scenario: Unavailable interactive renderer fails closed

- **WHEN** a WASM renderer is authorized for Tier 2 but its required worker guest cannot be resolved or loaded
- **THEN** the application SHALL show a host-owned indication that the selected renderer is unavailable
- **AND** it SHALL NOT execute an alternate guest, downgrade to Tier 1, or mount plugin output for that failed render
- **AND** an additional effective `render:raw-html` grant SHALL NOT authorize such a downgrade
