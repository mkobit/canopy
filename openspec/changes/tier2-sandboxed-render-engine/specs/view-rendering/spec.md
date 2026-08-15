## MODIFIED Requirements

### Requirement: Component registry and dynamic dispatch

The web application SHALL register rendering components and dispatch node rendering dynamically using the resolved `ViewDefinition` and `Renderer` metadata, dispatching `rendererKind: 'system'` renderers to registered native components and `rendererKind: 'wasm'` renderers to sandboxed plugin execution, and for `wasm` renderers SHALL select the render tier from the plugin's declared render capability so that static output renders through the Tier-1 inline path and interactive output renders through the Tier-2 sandboxed-iframe engine.

#### Scenario: Successful component dispatch

- **WHEN** a node resolves to a `Renderer` with `rendererKind: 'system'` and entry point `system:text`
- **THEN** the system SHALL render the node using the registered `TextBlockRenderer` component

#### Scenario: Successful wasm renderer dispatch

- **WHEN** a node resolves to a `Renderer` with `rendererKind: 'wasm'` whose plugin declares `render:raw-html`
- **THEN** the system SHALL execute the referenced plugin and render its sanitized output through the Tier-1 inline path

#### Scenario: Interactive wasm renderer dispatches to Tier 2

- **WHEN** a node resolves to a `Renderer` with `rendererKind: 'wasm'` whose plugin declares `render:interactive`
- **THEN** the system SHALL render its output through the Tier-2 sandboxed-iframe engine rather than the Tier-1 inline path

#### Scenario: Generic fallback on resolution failure

- **WHEN** a node's type does not map to any renderer, resolution fails, or `wasm` renderer execution fails or is terminated
- **THEN** the system SHALL render the node using a fallback representation showing its properties
