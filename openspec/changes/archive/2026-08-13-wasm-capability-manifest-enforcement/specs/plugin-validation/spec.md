## MODIFIED Requirements

### Requirement: Validate JSON manifest structure

The system SHALL check that any plugin node's `manifest` property is a valid JSON string conforming to the plugin manifest structure, including validating that each element in `manifest.capabilities` is a recognized `WasmCapability` string.

#### Scenario: Valid manifest
- **WHEN** a plugin node is validated and its `manifest` property is a JSON string containing a valid name, version, and a capabilities array with recognized capability strings
- **THEN** the validation SHALL pass for that property.

#### Scenario: Invalid manifest capability vocabulary
- **WHEN** a plugin node is validated and its `manifest` property contains a capability element that is not a recognized `WasmCapability` string
- **THEN** the validation SHALL fail for that property with a descriptive `ValidationError`.

#### Scenario: Invalid manifest
- **WHEN** a plugin node is validated and its `manifest` property is not valid JSON, or is missing required properties, or has incorrect property types
- **THEN** the validation SHALL fail for that property.
