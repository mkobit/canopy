## Context

Currently, Canopy's rendering system is completely hardcoded.
The web application uses a switch statement inside `BlockRenderer` to dispatch based on `node.type`.
This makes the bootstrapped `Renderer` and `default-renderer` settings schemas useless.
We want to wire the settings cascade and the bootstrapped metadata into the web application's rendering pipeline.
This design defines how view definitions and renderers are resolved, registered, and executed.

## Goals / Non-Goals

**Goals:**
- Implement a symmetric view resolution pipeline that resolves to a `ViewDefinition` node.
- Define system-level default renderers and default view definitions during graph bootstrap.
- Replace the hardcoded rendering dispatch in `BlockRenderer` with a registry-based dynamic lookup.
- Rename the settings key from `default-renderer` to `default-view` to reflect its target type.

**Non-Goals:**
- Implementing sandboxed WASM or custom user-provided renderers (explicitly deferred).
- Supporting layouts or configuration schemas beyond basic React component properties.
- Adding custom styling or editing tools specifically for Renderer definitions.

## Decisions

### Decision 1: Resolve default settings to a `ViewDefinition` node rather than a `Renderer` node
- **Rationale**: This maintains symmetry across all steps of the resolution sequence. It preserves the ability to customize layout and config properties (e.g., density or display style) in the future at any settings cascade scope.
- **Alternatives**: Resolving directly to a `Renderer` node was rejected because it would prevent scope-level layout customization.

### Decision 2: Rename setting key to `default-view`
- **Rationale**: Since the cascade resolves to a `ViewDefinition` node, using the key name `default-view` avoids confusion.
- **Alternatives**: Keeping the key `default-renderer` while returning a `ViewDefinition` ID was rejected due to naming mismatch.

### Decision 3: Use a static React component registry in the web application
- **Rationale**: Since execution of custom code is deferred, a static registry is the simplest and safest way to map a `Renderer` definition's `entryPoint` to its actual implementation.
- **Alternatives**: Dynamic imports or loading bundles at runtime were rejected as unnecessary complexity for the initial implementation.

## Risks / Trade-offs

- **[Risk]** Broken rendering if a renderer or view node is deleted or missing.
  - *Mitigation*: The `BlockRenderer` will fall back to a generic property list renderer if resolution fails.
- **[Risk]** Large schema size from bootstrapping view and renderer nodes.
  - *Mitigation*: We only seed three basic system renderers and views, which has negligible storage overhead.
