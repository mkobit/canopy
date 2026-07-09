# eslint-functional-enforcement

## Purpose

Enforce the functional/immutability architectural invariant at the linting layer.
The ESLint config keeps `eslint-plugin-functional` rules fully active with a minimal, explicitly documented allowlist so that mutable code cannot land in production packages without a visible error.
## Requirements
### Requirement: prefer-immutable-types is active for all source types

The ESLint config SHALL enforce `functional/prefer-immutable-types` at `ReadonlyShallow` depth for all `.ts` and `.tsx` files in `packages/` and `apps/` excluding test files.
The `ignoreTypePattern` list SHALL contain only specific, documented patterns — no catch-all glob (`.*`) is permitted.

#### Scenario: Mutable parameter type rejected

- **WHEN** a function parameter is typed with a mutable object type (e.g., `{ name: string }` instead of `Readonly<{ name: string }>`)
- **THEN** ESLint SHALL report a `functional/prefer-immutable-types` error

#### Scenario: ReadonlyShallow parameter accepted

- **WHEN** a function parameter is typed with a `Readonly<T>` or `readonly` array
- **THEN** ESLint SHALL not report a `functional/prefer-immutable-types` error

#### Scenario: Storage and sync adapters keep immutable public signatures

- **WHEN** a file is in `packages/storage/src/` or `packages/sync/src/`
- **THEN** `functional/prefer-immutable-types` SHALL remain active so the public adapter interface accepts and returns immutable types, even though `functional/immutable-data` and `functional/no-let` are disabled to permit encapsulated mutable state inside the implementation

### Requirement: React/UI overrides are scoped to FP-incompatible rules only

The ESLint config SHALL override functional rules for `apps/web/**` files only where React's model is inherently incompatible with pure FP — expression statements, void returns, and mixed prop types.
Immutability rules (`prefer-immutable-types`, `type-declaration-immutability`) SHALL remain active for React component files.

#### Scenario: React component with void event handler accepted

- **WHEN** a React component declares an `onClick` handler that returns `void`
- **THEN** ESLint SHALL not report a `functional/no-return-void` error for that file

#### Scenario: React component with mutable prop type rejected

- **WHEN** a React component prop interface declares a mutable (non-readonly) object field
- **THEN** ESLint SHALL report a `functional/prefer-immutable-types` error

### Requirement: Non-null assertions are banned in source files

The ESLint config SHALL set `@typescript-eslint/no-non-null-assertion` to `'error'` for all `.ts` and `.tsx` source files.

#### Scenario: Non-null assertion operator rejected

- **WHEN** source code contains a non-null assertion (`value!`)
- **THEN** ESLint SHALL report a `@typescript-eslint/no-non-null-assertion` error

#### Scenario: Explicit type guard accepted as replacement

- **WHEN** source code uses an explicit type guard or nullish coalescing instead of `!`
- **THEN** ESLint SHALL not report a `@typescript-eslint/no-non-null-assertion` error

### Requirement: ts-comment suppression directives are banned

The ESLint config SHALL set `@typescript-eslint/ban-ts-comment` to `'error'`, disallowing `@ts-ignore` and requiring `@ts-expect-error` with a description when suppression is genuinely needed.

#### Scenario: ts-ignore rejected

- **WHEN** source code contains a `// @ts-ignore` comment
- **THEN** ESLint SHALL report a `@typescript-eslint/ban-ts-comment` error

#### Scenario: ts-expect-error with description accepted

- **WHEN** source code contains `// @ts-expect-error <description>` where `<description>` is non-empty
- **THEN** ESLint SHALL not report a `@typescript-eslint/ban-ts-comment` error

### Requirement: Lint exits clean after violation remediation

After tightening or upgrading the ESLint configuration, all pre-existing and newly-surfaced violations in `packages/` and `apps/web/` SHALL be fixed so that `bun run lint` exits with code 0 and reports 0 errors.

#### Scenario: CI lint check passes

- **WHEN** the CI lint step runs `bun run lint`
- **THEN** the command SHALL exit 0 with no errors

#### Scenario: TypeScript type check still passes

- **WHEN** `bun run typecheck` is run after ESLint config changes and violation fixes
- **THEN** the command SHALL exit 0

