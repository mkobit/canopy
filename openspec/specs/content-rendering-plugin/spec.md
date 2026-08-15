# content-rendering-plugin Specification

## Purpose
TBD - created by archiving change wasm-content-rendering. Update Purpose after archive.
## Requirements
### Requirement: WASM renderer execution

The system SHALL execute a `RendererDefinition` whose `rendererKind` is `wasm` as a sandboxed WASM guest plugin via `executeSandboxedGuestPlugin`, passing the target content node's properties as input JSON and receiving the plugin's render output as JSON.

#### Scenario: Resolved wasm renderer executes its plugin

- **WHEN** a node resolves through the view cascade to a `RendererDefinition` with `rendererKind: 'wasm'`
- **THEN** the host SHALL locate the referenced `Plugin` node, execute its render export via `executeSandboxedGuestPlugin`, and use the returned output to render the node

#### Scenario: Execution is capability-scoped

- **WHEN** the host executes a `wasm` renderer
- **THEN** the capability token bound into execution SHALL be the intersection of the plugin manifest capabilities and the granted render scope, and SHALL grant no more than `render:raw-html`

#### Scenario: Execution failure falls back safely

- **WHEN** plugin execution returns an error `Result`, exceeds its fuel/memory/timeout bound, or returns output that is not valid render output
- **THEN** the host SHALL NOT render untrusted output and SHALL render a fallback representation instead of throwing

#### Scenario: Asynchronous execution does not block rendering

- **WHEN** a `wasm` renderer is resolved and its execution has not yet completed
- **THEN** the host SHALL render a non-blocking placeholder or fallback and SHALL swap in the sanitized output only once execution resolves

#### Scenario: Stale result is discarded

- **WHEN** a node's content changes while a render for its prior content is still in flight
- **THEN** the superseded result SHALL be discarded and SHALL NOT be mounted

### Requirement: Tier-1 sanitized inline rendering of untrusted HTML

The system SHALL treat plugin render output as untrusted and render static HTML output by sanitizing it (DOMPurify with DOM- and named-property-clobbering protections) and mounting it inside a closed Declarative Shadow DOM root; it SHALL NOT inject unsanitized plugin output into the host DOM.

#### Scenario: Static HTML output is sanitized before mount

- **WHEN** a `wasm` renderer returns raw HTML output
- **THEN** the host SHALL sanitize the HTML and mount the sanitized result in a closed shadow root, stripping scripts and event-handler attributes

#### Scenario: Named-property clobbering is neutralized

- **WHEN** plugin output contains elements with `id`/`name` attributes that would shadow host globals
- **THEN** sanitization SHALL rewrite them into a safe namespace so they cannot clobber host properties

#### Scenario: Live-script output is not executed inline

- **WHEN** plugin render output contains scripts or other live-JS constructs
- **THEN** the Tier-1 path SHALL NOT execute them (isolation for live content is the deferred Tier-2 iframe path, not this requirement)

### Requirement: First-party Markdown rendering plugin

The system SHALL provide a first-party Markdown rendering plugin, built through the existing WASM component pipeline, that renders `MarkdownNode` content and is installed into the graph as a `Plugin` node.

#### Scenario: Markdown node renders through the plugin

- **WHEN** a `MarkdownNode` is rendered in a bootstrapped graph
- **THEN** it SHALL resolve to the first-party Markdown `wasm` renderer and its content SHALL be rendered by the plugin's output, not by a native Markdown React component

#### Scenario: Plugin declares only render capability

- **WHEN** the Markdown plugin manifest is inspected
- **THEN** it SHALL declare `render:raw-html` and SHALL NOT declare write capabilities

### Requirement: Render tier selection

The system SHALL select a render tier for a `rendererKind: 'wasm'` renderer from the plugin's **effective granted** render capability: a renderer whose effective scope is limited to `render:raw-html` SHALL resolve to the Tier-1 sanitized-inline path, and a renderer whose effective scope includes an explicit `render:interactive` grant SHALL resolve to the Tier-2 sandboxed-iframe path.

#### Scenario: Static renderer resolves to Tier 1

- **WHEN** a resolved `wasm` renderer's effective scope is `render:raw-html` without `render:interactive`
- **THEN** the host SHALL render its output through the Tier-1 sanitized-inline path (DOMPurify + closed shadow DOM)

#### Scenario: Interactive renderer resolves to Tier 2

- **WHEN** a resolved `wasm` renderer's effective scope includes an explicit `render:interactive` grant
- **THEN** the host SHALL render its output through the Tier-2 sandboxed-iframe engine, not the Tier-1 inline path

#### Scenario: Wildcard grant does not auto-convey Tier 2

- **WHEN** a renderer is granted a wildcard scope such as `render:*` or `*` but not an explicit `render:interactive`
- **THEN** the host SHALL NOT route it to Tier-2 on the basis of the wildcard alone

#### Scenario: Interactive presence forces Tier 2

- **WHEN** a renderer's effective scope includes both `render:raw-html` and `render:interactive`
- **THEN** the presence of `render:interactive` SHALL force Tier-2 rather than Tier-1

#### Scenario: Interactive output is never inlined into the host DOM

- **WHEN** a renderer resolves to Tier-2 and returns output
- **THEN** the host SHALL NOT mount that output in the host DOM or a host shadow root
- **AND** the host SHALL mount it only inside an opaque-origin Tier-2 frame

### Requirement: Terminable execution for untrusted renderers

The system SHALL execute an untrusted `wasm` renderer through the terminable worker-isolated path, so that a renderer whose render computation runs away synchronously is terminated by the host rather than hanging the main thread.

#### Scenario: Untrusted renderer executes under host-terminable isolation

- **WHEN** the host executes a `wasm` renderer that is not first-party trusted
- **THEN** execution SHALL run under the worker-isolated, wall-clock-terminable path
- **AND** a runaway render SHALL resolve to a fallback rather than hanging the document

#### Scenario: First-party static renderer path is unchanged

- **WHEN** the host executes the first-party Markdown renderer
- **THEN** its existing Tier-1 sanitized-inline behavior SHALL be preserved

