# Tasks: TypeScript refactoring automations for duplicate types and unindexed imports

- [x] 1. Create `tools/refactor-ts.ts` AST refactoring tool using TypeScript Compiler API. <!-- id: task-1 -->
- [x] 2. Implement structural duplicate type detection across `@canopy/*` packages. <!-- id: task-2 -->
- [x] 3. Implement unindexed subpath import detection and rewriting to canonical package exports. <!-- id: task-3 -->
- [x] 4. Add unit test suite in `tools/refactor-ts.test.ts` covering dry-run detection and fix modes. <!-- id: task-4 -->
- [x] 5. Wire `refactor:check` and `refactor:fix` package scripts into root `package.json`. <!-- id: task-5 -->
