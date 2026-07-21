# plugin-validation Specification

## Purpose
TBD - created by archiving change plugin-validation-constraints. Update Purpose after archive.
## Requirements
### Requirement: Validate WebAssembly magic header

The system SHALL check that any plugin node's `wasm_binary` property contains a valid base64-encoded string representing a WebAssembly module, which may be raw or Brotli-compressed.

#### Scenario: Valid raw WASM magic header

- **WHEN** a plugin node is validated and its `wasm_binary` property contains a base64-encoded string starting with the WebAssembly magic header (`0x00 0x61 0x73 0x6d`)
- **THEN** the validation SHALL pass for that property.

#### Scenario: Valid Brotli-compressed WASM magic header

- **WHEN** a plugin node is validated and its `wasm_binary` property contains a base64-encoded Brotli-compressed string that decompresses to a WebAssembly binary starting with the magic header
- **THEN** the validation SHALL pass for that property.

#### Scenario: Invalid WASM magic header

- **WHEN** a plugin node is validated and its `wasm_binary` property is not valid base64, does not start with the magic header, or fails Brotli decompression
- **THEN** the validation SHALL fail for that property.

### Requirement: Validate JSON manifest structure

The system SHALL check that any plugin node's `manifest` property is a valid JSON string conforming to the plugin manifest structure.

#### Scenario: Valid manifest

- **WHEN** a plugin node is validated and its `manifest` property is a JSON string containing a valid name, version, and capabilities array
- **THEN** the validation SHALL pass for that property.

#### Scenario: Invalid manifest

- **WHEN** a plugin node is validated and its `manifest` property is not valid JSON, or is missing required properties, or has incorrect property types
- **THEN** the validation SHALL fail for that property.

