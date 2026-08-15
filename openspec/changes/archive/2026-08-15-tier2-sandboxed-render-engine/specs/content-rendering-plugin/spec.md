## ADDED Requirements

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
