## Why

WASM plugin manifests declare requested capability strings in `manifest.capabilities`, but runtime host bindings in `@canopy/api-adapter` rely on caller-provided bearer tokens without enforcing or validating the declared manifest capabilities.
Wiring manifest validation and load-time token minting ensures WASM plugins run with least privilege and cannot exceed their declared capabilities.

## What Changes

- Validate declared `capabilities` strings in `validatePluginManifest` against valid runtime `WasmCapability` values.
- Implement load-time capability intersection (`manifest.capabilities ∩ grantedContextCapabilities`) to mint a bound capability token for plugin host bindings.
- Bind the minted token directly into host import bindings (`createWasmHostBindings`), preventing guests from supplying arbitrary caller tokens.
- Support `render:declarative` and `render:raw-html` in the capability vocabulary for UI extension security.

## Capabilities

### New Capabilities

- `wasm-capability-manifest-enforcement`: Validates plugin manifest capability declarations and enforces load-time capability token binding for WASM plugins.

### Modified Capabilities

- `plugin-validation`: Validates that element strings in `manifest.capabilities` belong to the known `WasmCapability` vocabulary.

## Impact

- `@canopy/graph`: Updates `packages/graph/src/plugin-validation.ts` to validate capability vocabulary.
- `@canopy/api-adapter`: Updates `packages/api-adapter/src/wasm/capabilities.ts` and `packages/api-adapter/src/wasm/host-bindings.ts` to support token minting, intersection, and load-time token binding.
