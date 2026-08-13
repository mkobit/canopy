## 1. Capability Vocabulary & Manifest Validation

- [x] 1.1 Export `KNOWN_WASM_CAPABILITIES` allowlist array and `isWasmCapability` type guard in `packages/api-adapter/src/wasm/capabilities.ts`
- [x] 1.2 Update `validatePluginManifest` in `packages/graph/src/plugin-validation.ts` to validate that all entries in `manifest.capabilities` are recognized `WasmCapability` values
- [x] 1.3 Add unit tests in `packages/graph/src/plugin-validation.test.ts` for manifest capability vocabulary validation

## 2. Load-Time Capability Intersection & Host Binding Scoping

- [x] 2.1 Implement `intersectCapabilities` in `packages/api-adapter/src/wasm/capabilities.ts` to compute effective scope from requested manifest capabilities and granted session capabilities
- [x] 2.2 Update `WasmHostBindingsOptions` in `packages/api-adapter/src/wasm/host-bindings.ts` to accept `boundToken` and use it in `invokeHostBinding`
- [x] 2.3 Add unit tests in `packages/api-adapter/src/wasm/capabilities.test.ts` and `packages/api-adapter/src/wasm/host-bindings.test.ts`

## 3. Verification & Quality Gates

- [x] 3.1 Run `openspec validate wasm-capability-manifest-enforcement` and ensure all spec checks pass
- [x] 3.2 Run lint, build, typecheck, and tests across the workspace
