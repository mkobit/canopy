# Design: TypeScript refactoring automations for duplicate types and unindexed imports

## Architecture

The TypeScript refactoring automation tool `tools/refactor-ts.ts` is executed via Bun (`bun run tools/refactor-ts.ts`).
It leverages the official `typescript` compiler API to parse source files into ASTs, analyze type/interface definitions across package boundaries, identify unindexed package subpath imports, and rewrite source files deterministically.

## Technical details

### AST analysis and inspection

- Parse source files under `packages/*/src` and `apps/*/src` using `ts.createSourceFile`.
- Duplicate type detection: Collect AST Nodes for `InterfaceDeclaration` and `TypeAliasDeclaration`, hashing structural signatures (member names, property types, branding).
- Unindexed import detection: Scan `ImportDeclaration` module specifiers matching `@canopy/<pkg>/src/*` or deep subpaths, mapping them to canonical package root imports `@canopy/<pkg>`.

### Refactoring CLI tool interface

- Location: `tools/refactor-ts.ts`
- Arguments:
  - `--check` / `--dry-run`: Scans for duplicate types and unindexed imports, exits with code 1 if issues are found.
  - `--fix`: Modifies files in-place to consolidate duplicate types and rewrite unindexed subpath imports to canonical package exports.
- Output: Structured console report showing identified duplicates and rewritten import specifiers.

## Adversarial review and mitigations

### Resource and performance overhead

- **Risk**: Full AST parsing of all TypeScript files across the monorepo on every invocation could cause slow execution.
- **Mitigation**: Scope AST parsing strictly to package `src/` directories, excluding `node_modules`, `dist/`, `.git`, and guest transpiled WASM shims.

### Failure modes and edge cases

- **Risk**: Automated AST rewriting of imports might introduce circular dependencies between packages if internal types are re-exported incorrectly.
- **Mitigation**: Validate rewritten ASTs using TypeScript program type checking (`bun run typecheck`) and verification tests before writing changes to disk in `--fix` mode.

### Security and isolation

- **Risk**: In-place AST file modifications could corrupt source code if parsing fails on complex generic or ambient type syntax.
- **Mitigation**: Perform AST transformations using immutable string replacements anchored to line and character offsets computed by `ts.Printer` or precise source ranges, and verify syntax validity prior to saving.

### Migration and backward compatibility

- **Risk**: Internal package relative imports (e.g. `../foo.ts` within the same package) could be mistakenly flagged as unindexed cross-package imports.
- **Mitigation**: Explicitly target cross-package package specifiers starting with `@canopy/` containing `/src/` subpaths, leaving intra-package relative imports untouched.
