## MODIFIED Requirements

### Requirement: Validate declared plugin capability vocabulary

The system SHALL validate that all capability strings declared in a plugin's manifest belong to the set of supported `WasmCapability` strings, which includes `render:interactive` for renderers that require Tier-2 sandboxed-iframe execution of live output, kept in sync between the `packages/api-adapter` vocabulary and the `packages/graph` leaf-side duplicate.

#### Scenario: Recognized capability strings pass validation

- **WHEN** `validatePluginManifest` is called with capabilities such as `read:nodes`, `write:create-node`, `render:declarative`, `render:raw-html`, or `render:interactive`
- **THEN** validation succeeds without error.

#### Scenario: Unrecognized capability string fails validation

- **WHEN** `validatePluginManifest` is called with an unknown capability string like `invalid:capability`
- **THEN** validation fails returning a `ValidationError` identifying the invalid capability element.

#### Scenario: Interactive render capability is recognized across both vocabularies

- **WHEN** the `render:interactive` capability value is checked against the `packages/api-adapter` `KNOWN_WASM_CAPABILITIES` set and the `packages/graph` leaf-side duplicate
- **THEN** both sets SHALL contain it, so a leaf-side capability check and a host-side check agree.
