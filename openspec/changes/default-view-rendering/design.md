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
- Support component delegation by exposing `BlockRenderer` as a reusable component for recursive child rendering.
- Enforce strict recursion protection to prevent infinite rendering loops on cyclic graphs.
- Use Canopy's standard `Result<T, E>` functional wrapper for error reporting in the view resolution engine.

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

### Decision 4: Expose component delegation for child rendering

- **Rationale**: Reusing smaller, specific components within larger components (e.g. rendering list items or children inside a custom container component) should go through the same view/renderer resolution. By exporting `BlockRenderer` (or a similar delegation helper) to the registry, any custom component can render child nodes by delegating back to the system, preserving dynamic rendering resolution for all nested content.
- **Alternatives**: Forcing components to hardcode child renderers was rejected because it breaks plugin extensibility and modularity.

### Decision 5: Functional error handling in resolution engine

- **Rationale**: The resolution engine `resolveViewDefinition` will return a `Result<Node, Error>` instead of a nullable value. This ensures that failures (such as missing nodes or invalid schema types) are tracked explicitly, avoiding silent bugs.
- **Alternatives**: Returning `undefined` was rejected to adhere to the codebase's strict functional error-handling invariants.

### Decision 6: Recursion cycle prevention via visited tracking

- **Rationale**: To prevent browser tab crashes from infinite rendering loops on cyclic graphs, components will pass down a `ReadonlySet<NodeId>` representing already-visited nodes. If a child node has already been visited, the system will halt recursion and render a warning block.
- **Alternatives**: Relying on database validation of cycles was rejected because schema-level constraints are warning-only and eventually consistent.

### Decision 7: Shared entryPoint type safety

- **Rationale**: Define a compile-time string union type `SystemRendererEntryPoint` in `@canopy/graph` to restrict the entry point identifiers. The React component registry will use this type to guarantee type safety and prevent drift between graph metadata and UI code.
- **Alternatives**: Using plain string registry keys was rejected because typos would fail silently at runtime.

## Adversarial review and mitigations

### 1. Resource and performance overhead
- **[Risk]** Traverse overhead during the settings cascade for every rendered block.
  - _Mitigation_: Leverage the settings pre-indexing added in canopy-o20 to perform O(1) namespace and type schema lookups. Keep the cascade resolution logic highly optimized by terminating early once a matching setting is resolved.
- **[Risk]** Component lookup overhead in React render loops.
  - _Mitigation_: Use a static TypeScript registry map for O(1) direct lookup, bypassing any dynamic module loading or parsing overhead.

### 2. Failure modes and edge cases
- **[Risk]** Cyclic rendering loop from nested nodes causing client browser tabs to crash.
  - _Mitigation_: Enforce strict cycle detection by passing a `ReadonlySet<NodeId>` representing already-visited nodes down the rendering context. Halt recursion immediately and render a clean inline error block if a cycle is detected.
- **[Risk]** Missing or deleted ViewDefinition or Renderer nodes.
  - _Mitigation_: Fall back gracefully to a hardcoded generic property-list renderer if `resolveViewDefinition` returns an error or resolves to a missing entry point.
- **[Risk]** Settings database entry mapping to a malformed or non-existent NodeId.
  - _Mitigation_: Return a structured `Result<Node, Error>` from the resolution cascade rather than throwing, allowing caller components to catch failures and apply the default fallback layout.

### 3. Security and isolation
- **[Risk]** Arbitrary or malicious component execution if a user creates custom entryPoint strings.
  - _Mitigation_: Restrict component resolution strictly to the `SystemRendererEntryPoint` compile-time string union type. Only allow components registered in the static code-defined React registry to execute, avoiding any runtime script injection pathways.

### 4. Migration and backward compatibility
- **[Risk]** Broken graphs due to renaming the `default-renderer` setting key to `default-view`.
  - _Mitigation_: Since the system is pre-1.0 and has zero active user vaults, no data migration path is required. Re-bootstrap all system settings schemas during startup to overwrite the old keys cleanly.
