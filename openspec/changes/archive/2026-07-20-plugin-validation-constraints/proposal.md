## Why

Plugins in Canopy are stored as nodes in the graph.
To ensure system stability, security, and correct execution of WebAssembly plugins, the host must validate plugin nodes before loading them.
Without proper validation, malformed base64 binary strings or invalid manifest JSON structures would cause runtime crashes during plugin instantiation.

## What changes

- **WASM binary validation**: Implement check to verify that `wasm_binary` is a valid base64 string and starts with the WebAssembly binary magic header (`\x00asm`).
- **Manifest validation**: Implement check to parse the JSON manifest and verify it contains the required properties (`name`, `version`, `capabilities`).
- **Graph node validation integration**: Hook these validations into the core `validateNode` function in `@canopy/graph` when a node of type `Plugin` is validated.
- **Unit testing**: Add tests to cover both valid and invalid plugin node properties.

## Capabilities

### New capabilities

- `plugin-validation-constraints`: Validate the format, headers, and structure of WebAssembly plugin binary data and manifest JSON properties.

### Modified capabilities

<!-- None -->

## Impact

- `@canopy/graph`: Adds validators and integrates them into `validateNode`.
