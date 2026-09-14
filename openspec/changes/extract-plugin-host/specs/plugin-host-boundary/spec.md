## ADDED Requirements

### Requirement: Plugin execution is independent of transport adapters

The system SHALL expose WASM host bindings, capability validation, sandbox execution, and termination helpers through `@canopy/plugin-host`.
Neither `@canopy/plugin-host` nor `@canopy/graph-access` SHALL import `@canopy/api-adapter`, including type-only imports.
The browser application SHALL consume plugin execution without an api-adapter package dependency.

#### Scenario: Browser and worker build without transport modules

- **WHEN** the web application and its plugin workers are built through their production entrypoints
- **THEN** their module graphs contain no `@canopy/api-adapter` modules or GraphQL/IPC modules introduced through plugin execution
- **AND** their plugin imports resolve through public package entrypoints

#### Scenario: Forbidden source import fails the quality gate

- **WHEN** a plugin-host or graph-access production file imports api-adapter normally, through a type-only import, alias, relative path, deep import, or dynamic import
- **THEN** the source-boundary check fails
- **AND** the check includes allowed and forbidden fixture coverage

### Requirement: Plugins and protocols share graph operations

`@canopy/graph-access` SHALL own the existing shared graph query, mutation, and event-access implementation.
Transport adapters and plugin host bindings SHALL invoke this implementation rather than maintain parallel handlers.
Mutation operations SHALL continue to commit through `GraphSession`.

#### Scenario: Access behavior survives extraction

- **WHEN** equivalent operation payloads are executed through existing protocol and WIT adapters
- **THEN** tenant filtering, current-session reads, query limits, mutation results, and replay limits preserve their existing behavior
- **AND** a mutation without the required session returns the existing error category

### Requirement: Protocol error translation stays with its owner

Graph-access SHALL expose protocol-independent error categories and `Result` contracts.
gRPC and GraphQL conversions SHALL remain in api-adapter, and WIT conversion SHALL belong to plugin-host.

#### Scenario: Error conversion preserves compatibility

- **WHEN** an existing error category is converted to each supported protocol
- **THEN** its serialized code and error payload remain compatible with the pre-extraction contract
- **AND** graph-access does not import a transport or WIT converter

### Requirement: Plugin isolation survives package extraction

The extraction SHALL preserve load-time token binding, capability intersection, main-thread dispatch validation, execution limits, and existing worker isolation.
The effective WASM fuel default and explicit override precedence SHALL remain unchanged when fuel configuration moves to plugin-host options.
Extraction implementation SHALL start from a revision that fixes the independently identified executor token bypass and includes regression coverage for it.

#### Scenario: Guest token cannot escalate authority

- **WHEN** a plugin supplies a more privileged token than its bound token
- **THEN** the requested operation is checked against the bound authority and manifest grants
- **AND** worker dispatch does not bypass the host's live-graph capability validation

#### Scenario: Runaway guest remains bounded

- **WHEN** an untrusted worker guest fails to yield or exceeds its configured memory ceiling
- **THEN** existing termination and memory enforcement remain effective
- **AND** the caller receives the existing bounded error or fallback behavior

#### Scenario: Fuel controls retain their individual meanings

- **WHEN** a former context-level fuel value is migrated to the host's default options
- **THEN** the total remains that value unless an explicit execution override is supplied
- **AND** absent configuration the total remains `1_000_000n`
- **AND** the distinct per-import default remains `100n` with its existing explicit override behavior

### Requirement: WIT contracts retain distinct ownership

The inline graph API WIT contract and its compatibility snapshot SHALL move to plugin-host unchanged.
The modular browser WIT worlds and their code-generation pipeline SHALL retain their existing ownership and behavior.

#### Scenario: Contract checks after extraction

- **WHEN** compatibility checks and browser WIT generation run
- **THEN** the inline WIT snapshot is unchanged and checked under plugin-host ownership
- **AND** browser guest worlds continue to build through their existing pipeline
- **AND** compatibility checks for both `--target wit` and `--target all` read the baseline from its new owner without an api-adapter dependency on plugin-host

### Requirement: Capability vocabulary preserves the graph leaf

Extraction SHALL preserve the existing capability vocabulary and equality guard between manifest validation and the plugin host.
The graph package SHALL NOT import plugin-host or api-adapter to validate a plugin manifest.

#### Scenario: Manifest validation without host build

- **WHEN** the graph package is built and its manifest validation is exercised independently
- **THEN** it recognizes the same capabilities as before extraction
- **AND** neither plugin-host execution nor host-package compilation is required

### Requirement: Internal package migration is atomic

Moved shared exports SHALL be consumed from graph-access and moved WASM exports from plugin-host.
The integration SHALL update all affected production consumers, package dependencies, build references, test mappings, and the canonical bounded-context map together.

#### Scenario: Built package consumers resolve migrated exports

- **WHEN** packages are built from a clean checkout and consumer checks run against built entrypoints
- **THEN** no consumer requires a removed api-adapter export or cross-package source import
- **AND** existing protocol compatibility tests continue to pass
