## 1. Implement validation logic

- [x] 1.1 Create `packages/graph/src/plugin-validation.ts` and define validation helper functions for the WebAssembly binary and the JSON manifest.
- [x] 1.2 Import the new helpers in `packages/graph/src/validation.ts` and call them within `validateNode` if the node matches the plugin type.

## 2. Test and verify validation

- [x] 2.1 Add unit tests in a new file `packages/graph/tests/plugin-validation.test.ts` (or append to validation tests) to verify the new validators against valid/invalid plugins.
- [x] 2.2 Run quality gates and ensure the full project builds and passes checks.
