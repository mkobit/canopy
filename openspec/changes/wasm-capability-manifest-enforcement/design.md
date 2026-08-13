## Context

Canopy WASM plugins specify declared capabilities in `manifest.capabilities` (e.g., `["read:nodes", "write:create-node"]`).
Currently, `packages/graph/src/plugin-validation.ts` only validates that `manifest.capabilities` is an array of non-empty strings.
Meanwhile, `@canopy/api-adapter` enforces capabilities via bearer token scope strings, but `createWasmHostBindings` expects a caller-supplied token per call rather than binding a token derived from the plugin's manifest.
This allows a guest plugin to potentially invoke host APIs using any token passed in by the caller.

## Goals / Non-Goals

**Goals:**

- Validate that manifest capabilities belong to a strictly defined vocabulary of valid `WasmCapability` strings.
- Compute an effective granted scope at load time using capability intersection (`manifest.capabilities ∩ grantedContextCapabilities`).
- Bind the load-time capability token directly into `createWasmHostBindings` so WASM imports enforce capability checks without caller token injection.
- Expand `WasmCapability` vocabulary to include `render:declarative` and `render:raw-html` for extension rendering security.

**Non-Goals:**

- Dynamic user permission prompt dialogs for browser extensions.
- Dynamic per-resource (node ID level) granular ACLs (handled by ReBAC/ABAC in future scope).

## Decisions

### Decision 1: Manifest Capability Vocabulary Validation

- **Choice**: Validate each entry in `manifest.capabilities` against an allowlist of valid `WasmCapability` values (`read:nodes`, `read:edges`, `read:properties`, `read:traversal`, `read:events`, `write:create-node`, `write:update-properties`, `write:delete-node`, `write:create-edge`, `write:delete-edge`, `render:declarative`, `render:raw-html`, `wizard`, `read:*`, `write:*`, `*`). The `wizard` UI-extension capability is included because `apps/web` already gates wizard launch on `manifest.capabilities.includes('wizard')`; omitting it would reject every existing wizard plugin at manifest validation.
- **Rationale**: Rejecting invalid or typo-ridden capability strings at manifest parse time prevents silent permission failures or privilege escalation attempts.
- **Alternatives Considered**:
  - _Silently ignoring unknown capabilities_: Rejected because undeclared/invalid permissions should fail validation immediately (matching Chrome extension manifest model).

### Decision 2: Load-Time Token Minting and Attenuation

- **Choice**: Compute `effectiveCapabilities` at load time via `intersectCapabilities(manifestCapabilities, contextGrantedCapabilities)`. Mint a single space-delimited scope string bound to `WasmHostBindings`.
- **Rationale**: Matching WASI link-time attenuation and Chrome granted permissions, moving authority computation from call time to instantiation time ensures the guest WASM component can never exceed its manifest declarations or host session grants.
- **Alternatives Considered**:
  - _Allowing guest components to supply bearer tokens per call_: Rejected because guest components should not choose or manage tokens.

### Decision 3: Host Binding Token Scoping

- **Choice**: Modify `WasmHostBindingsOptions` to accept `boundToken?: string`. In `invokeHostBinding`, use `options.boundToken` (falling back to passed token if missing for backward compatibility) when verifying capabilities.
- **Rationale**: Preserves compatibility with existing tests while enabling load-time bound tokens for WASM instances.

## Adversarial review and mitigations

### 1. Resource and Performance Overhead

- **Token Parsing and Validation Cost**:
  - _Risk_: Re-parsing scope strings on every WIT import invocation could introduce CPU overhead.
  - _Mitigation_: `parseTokenScopes` operates on small strings (less than 10 tokens) in memory ($O(N)$ string split). `defaultCapabilityValidator` evaluates array membership directly.

### 2. Failure Modes and Edge Cases

- **Manifest Asking for Unrecognized Capabilities**:
  - _Risk_: A third-party plugin manifest declares a capability string not present in `WasmCapability`.
  - _Mitigation_: `validatePluginManifest` returns an explicit `ValidationError` identifying the invalid capability element and line path.
- **Empty Capability Intersection**:
  - _Risk_: If a plugin requests `write:create-node` but the host context only grants `read:*`, the intersection is empty.
  - _Mitigation_: `intersectCapabilities` produces an empty scope token `""`. Any subsequent mutation call by the plugin returns `FORBIDDEN` error via `verifyCapability`.

### 3. Migration and Backward Compatibility

- **Existing Host Binding Invocation Signature**:
  - _Risk_: Existing tests or callers pass `token` directly to host query/mutation methods (e.g. `bindings.queries.queryNodes(token, payload)`).
  - _Mitigation_: `invokeHostBinding` prioritizes `options.boundToken` if present, falling back to the `token` argument if `options.boundToken` is undefined.

## Risks / Trade-offs

- **[Risk]**: Static capability vocabulary requires updating `WasmCapability` when new host APIs are introduced.
  - **[Mitigation]**: `WasmCapability` type definition in `@canopy/api-adapter` is centralized and exported.
