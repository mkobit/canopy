## MODIFIED Requirements

### Requirement: WASM renderer execution

The system SHALL execute the plugin referenced by a `Renderer` whose `rendererKind` is `wasm` as a sandboxed WASM guest via `executeSandboxedGuestPlugin`, passing the target content node's properties as input JSON and receiving the plugin's render output as JSON.
Here `Renderer` is the graph-resident renderer definition historically called `RendererDefinition`, not a new node type.
Execution SHALL retain the existing terminable-execution requirement for untrusted renderers.

#### Scenario: Resolved wasm renderer executes its plugin

- **WHEN** a node resolves through the view cascade to a `Renderer` with `rendererKind: 'wasm'`
- **THEN** the host SHALL locate the referenced `Plugin` node, execute its render export via `executeSandboxedGuestPlugin`, and use the returned output to render the node

#### Scenario: Execution is capability-scoped

- **WHEN** the host executes a `wasm` renderer
- **THEN** the capability token bound into execution SHALL be the intersection of the plugin manifest capabilities and the host-granted render scope
- **AND** Tier-2 authorization SHALL require an explicit non-wildcard `render:interactive` grant in the host scope as well as that capability in the effective intersection
- **AND** the bundled first-party static Markdown renderer's host grant SHALL remain limited to `render:raw-html`

#### Scenario: Execution failure falls back safely

- **WHEN** plugin execution returns an error `Result`, exceeds its fuel/memory/timeout bound, or returns output that is not valid render output
- **THEN** the host SHALL NOT render untrusted output and SHALL render a fallback representation instead of throwing

#### Scenario: Asynchronous execution does not block rendering

- **WHEN** a `wasm` renderer is resolved and its execution has not yet completed
- **THEN** the host SHALL render a non-blocking placeholder or fallback and SHALL swap in the output only once execution resolves and the selected tier's output validation and isolation requirements are satisfied

#### Scenario: Stale result is discarded

- **WHEN** a node's content changes while a render for its prior content is still in flight
- **THEN** the superseded result SHALL be discarded and SHALL NOT be mounted
