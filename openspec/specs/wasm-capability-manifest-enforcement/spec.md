# wasm-capability-manifest-enforcement Specification

## Purpose
TBD - created by archiving change wasm-capability-manifest-enforcement. Update Purpose after archive.
## Requirements
### Requirement: Validate declared plugin capability vocabulary

The system SHALL validate that all capability strings declared in a plugin's manifest belong to the set of supported `WasmCapability` strings.

#### Scenario: Recognized capability strings pass validation
- **WHEN** `validatePluginManifest` is called with capabilities such as `read:nodes`, `write:create-node`, `render:declarative`, or `render:raw-html`
- **THEN** validation succeeds without error.

#### Scenario: Unrecognized capability string fails validation
- **WHEN** `validatePluginManifest` is called with an unknown capability string like `invalid:capability`
- **THEN** validation fails returning a `ValidationError` identifying the invalid capability element.

### Requirement: Compute load-time capability intersection

The system SHALL compute an effective capability set by intersecting the manifest declared capabilities with the context granted capability scopes at plugin load time.

#### Scenario: Capability intersection with matching grant
- **WHEN** a plugin manifest declares `["read:nodes", "write:create-node"]` and the session grants `read:*`
- **THEN** the computed effective capability set is `read:nodes`.

#### Scenario: Capability intersection with wildcard grant
- **WHEN** a plugin manifest declares `["read:nodes", "write:create-node"]` and the session grants `*`
- **THEN** the computed effective capability set includes `read:nodes` and `write:create-node`.

### Requirement: Bind capability token at host binding instantiation

The system SHALL bind the load-time effective capability token directly into `createWasmHostBindings` so guest WASM import calls are evaluated against the bound token.

#### Scenario: Host import invocation with bound capability token
- **WHEN** a WASM plugin invokes host binding imports with a load-time bound token
- **THEN** capability checks evaluate against the bound token and restrict ungranted host API access.

