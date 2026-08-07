# TypeScript refactoring spec

## ADDED Requirements

### Requirement: AST refactoring automations for duplicate types and unindexed imports

The TypeScript refactoring tool MUST scan TypeScript files across monorepo packages, detect structural duplicate type/interface declarations, and rewrite unindexed subpath imports to canonical package exports.

#### Scenario: Dry-run check for unindexed subpath imports

- **WHEN** `bun run refactor:check` is executed on code containing `@canopy/<pkg>/src/*` cross-package imports
- **THEN** the command MUST report unindexed subpath imports and exit with a non-zero status code

#### Scenario: In-place fix for unindexed subpath imports

- **WHEN** `bun run refactor:fix` is executed
- **THEN** all cross-package subpath imports MUST be rewritten to canonical `@canopy/<pkg>` exports and files saved in-place
