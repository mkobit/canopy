## 1. Schema and Bootstrap Changes

- [x] 1.1 Rename setting key from `default-renderer` to `default-view` and update system IDs in `packages/graph/src/system.ts` and `packages/graph/src/bootstrap.ts`.
- [x] 1.2 Define system edge types for `uses_renderer`, `view_override`, and `default_view`.
- [x] 1.3 Seed default system Renderer nodes for Text, Code, and Markdown during bootstrap.
- [x] 1.4 Seed default ViewDefinition nodes and map node types to their default views during bootstrap.
- [x] 1.5 Update bootstrap and settings cascade tests to verify the renamed key and new nodes.
- [x] 1.6 Define `SystemRendererEntryPoint` compile-time string union type in `packages/graph/src/system.ts`.

## 2. View Resolution Engine

- [x] 2.1 Implement `resolveViewDefinition` returning `Result<Node, Error>` in `packages/settings` that resolves a node's effective view.
- [x] 2.2 Add unit tests for `resolveViewDefinition` covering all cascade levels and functional error responses.

## 3. Web UI Registry and Dynamic Dispatch

- [x] 3.1 Create the React component registry using the `SystemRendererEntryPoint` union type to map entry points to rendering components.
- [x] 3.2 Update `BlockRenderer` to dynamically resolve and render components using the registry.
- [x] 3.3 Implement generic fallback rendering in `BlockRenderer` for unresolved or missing renderers.
- [x] 3.4 Verify rendering end-to-end using an e2e test or manual testing.
- [x] 3.5 Ensure container components can delegate child rendering recursively via `BlockRenderer` using resolved view definitions.
- [x] 3.6 Implement recursion cycle safety in `BlockRenderer` using `ReadonlySet<NodeId>` visited tracking.
