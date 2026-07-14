## 1. Schema and Bootstrap Changes

- [ ] 1.1 Rename setting key from `default-renderer` to `default-view` and update system IDs in `packages/graph/src/system.ts` and `packages/graph/src/bootstrap.ts`.
- [ ] 1.2 Define system edge types for `uses_renderer`, `view_override`, and `default_view`.
- [ ] 1.3 Seed default system Renderer nodes for Text, Code, and Markdown during bootstrap.
- [ ] 1.4 Seed default ViewDefinition nodes and map node types to their default views during bootstrap.
- [ ] 1.5 Update bootstrap and settings cascade tests to verify the renamed key and new nodes.

## 2. View Resolution Engine

- [ ] 2.1 Implement `resolveViewDefinition` in `packages/settings` that resolves a node's effective view.
- [ ] 2.2 Add unit tests for `resolveViewDefinition` covering all cascade levels.

## 3. Web UI Registry and Dynamic Dispatch

- [ ] 3.1 Create the React component registry mapping entry points to rendering components.
- [ ] 3.2 Update `BlockRenderer` to dynamically resolve and render components using the registry.
- [ ] 3.3 Implement generic fallback rendering in `BlockRenderer` for unresolved or missing renderers.
- [ ] 3.4 Verify rendering end-to-end using an e2e test or manual testing.
