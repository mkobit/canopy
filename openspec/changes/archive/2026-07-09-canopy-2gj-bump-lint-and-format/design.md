## Context

The project currently relies on older versions of ESLint, Prettier, and eslint-plugin-functional.
Dependabot previously opened PR #328 to bump these, but it failed due to build order/caching and linting errors.
We will bump these packages and resolve all surfaced errors.

## Goals / Non-Goals

**Goals:**
- Update `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `eslint`, `eslint-plugin-functional`, `eslint-plugin-unicorn`, and `prettier` to the target versions.
- Fix all new linting and formatting errors surfaced by the bump.
- Keep the build, typecheck, and test tasks passing.

**Non-Goals:**
- Upgrade TypeScript to version 7.0 at this time because `@typescript-eslint` does not yet natively support it.
- Suppress or disable any rules to work around new violations.

## Decisions

- **Do not bump TypeScript to version 7**: Bumping TypeScript to version 7.0 would break type-aware linting because `@typescript-eslint` lacks a stable compiler API for it. We will keep TypeScript at its current version.
- **Fix all lint violations rather than suppress them**: We will rewrite code to conform to any new rule checks (such as the newer rules in `eslint-plugin-functional` v10) rather than disabling them.
- **Clear incremental compile cache before building**: To avoid stale compile error warnings, we will clear `*.tsbuildinfo` files before rebuilding.

## Risks / Trade-offs

- **[Risk]** Breaking changes in rules from `eslint-plugin-functional` v10 or `eslint-plugin-unicorn` could require extensive refactoring.
- **[Mitigation]** We will address errors incrementally, starting with automatic fixer rules and then manually correcting complex violations.
