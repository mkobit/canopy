## Context

The canopy workspace uses TypeScript for compile-time type verification, packaging, and editor assistance.
Currently, the codebase uses TypeScript 6.0.3.
We will upgrade TypeScript to version 7 to take advantage of the Go-based compiler rewrite (providing 8x to 12x faster compilation) and keep compiler compatibility aligned with the latest standards.

## Goals / Non-Goals

**Goals:**

- upgrade the workspace `typescript` dependency to version 7.
- ensure all packages and apps build successfully without any compilation errors.
- verify that all tests compile and execute successfully.
- ensure that ESLint runs cleanly with zero parser or functional linting errors under the new TypeScript version.

**Non-Goals:**

- rewriting codebase syntax to use new TypeScript 7 specific language features unless required to fix compiler errors.
- replacing the Bun-based package management or test runner toolchain.

## Decisions

### Decision 1: Upgrade to TypeScript 7 in root `package.json`
We will upgrade the devDependency `typescript` in the root `package.json` to version `^7.0.0` or the latest stable TS 7 release.
* **rationale**: TypeScript 7 features a performance-optimized Go-based compiler rewrite.
* **alternatives considered**: keeping TypeScript 6.x (misses out on 8x-12x compile speedups and modern typing alignments).

### Decision 2: Run validation and perform compiler type fixups
We will run `bun run build` and `bun run typecheck` to identify compile-time type check errors introduced by TypeScript 7's stricter compiler behavior, and fix them in place.
* **rationale**: major compiler upgrades often introduce stricter inference rules, particularly around recursive types, generics, and union intersections.
* **alternatives considered**: disabling strict options (violates Canopy's architectural invariants regarding strict typing and quality).

### Decision 3: Update `typescript-eslint` parser if necessary
We will verify that `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` correctly parse AST features produced by the TS 7 compiler.
* **rationale**: ESLint parsing errors will block CI pipelines.
* **alternatives considered**: disabling ESLint on build gates (violates functional validation invariants).

## Risks / Trade-offs

- [Risk] TypeScript 7 Go compiler might not support some deprecated `tsconfig.json` options.
  - [Mitigation] Review compiler flags and remove/replace any deprecated properties.
- [Risk] Package resolution mismatches between Bun and TS 7 compiler.
  - [Mitigation] Verify that tsconfig.base.json and package path mappings are correctly resolved.

## Adversarial review and mitigations

### Resource and Performance Overhead
- *Risk*: A new compiler version could increase memory usage or introduce performance regression on large codebases.
- *Mitigation*: The Go-based TS 7 compiler has a significantly smaller memory footprint and delivers 8x-12x build performance improvements, resulting in a net reduction in resource usage.

### Failure Modes and Edge Cases
- *Risk*: Third-party package typings (like React or Node types) might be incompatible with TS 7 type inference, resulting in type errors outside our control.
- *Mitigation*: If typing errors occur within third-party packages, we will use `@ts-expect-error` comments accompanied by descriptive justifications, conforming to Canopy's linting guidelines.

### Security and Isolation
- *Risk*: A major version upgrade in the npm package registry could introduce supply chain risks if a compromised or unofficial package is selected.
- *Mitigation*: We will specify the official Microsoft package name `typescript` and install it using Bun's lockfile mechanism to ensure integrity.

### Migration and Compatibility
- *Risk*: Developer editors (like VS Code) might default to an older TypeScript version, reporting errors that do not align with the TS 7 compiler.
- *Mitigation*: The root `.vscode/settings.json` (if present) or editor settings should be updated to use the workspace version of TypeScript.
- *Risk*: Custom type guards or complex branded types in Canopy might fail due to type checker refinement changes in TS 7.
- *Mitigation*: We will systematically inspect typecheck logs and adapt type definitions to satisfy the new rules while maintaining the exact same runtime behavior.
