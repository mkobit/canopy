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

- **rationale**: TypeScript 7 features a performance-optimized Go-based compiler rewrite.
- **alternatives considered**: keeping TypeScript 6.x (misses out on 8x-12x compile speedups and modern typing alignments).

### Decision 2: Run validation and perform compiler type fixups

We will run `bun run build` and `bun run typecheck` to identify compile-time type check errors introduced by TypeScript 7's stricter compiler behavior, and fix them in place.

- **rationale**: major compiler upgrades often introduce stricter inference rules, particularly around recursive types, generics, and union intersections.
- **alternatives considered**: disabling strict options (violates Canopy's architectural invariants regarding strict typing and quality).

### Decision 3: Update `typescript-eslint` parser if necessary

We will verify that `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin` correctly parse AST features produced by the TS 7 compiler.

- **rationale**: ESLint parsing errors will block CI pipelines.
- **alternatives considered**: disabling ESLint on build gates (violates functional validation invariants).

## Risks / Trade-offs

- [Risk] TypeScript 7 Go compiler might not support some deprecated `tsconfig.json` options.
  - [Mitigation] Review compiler flags and remove/replace any deprecated properties.
- [Risk] Package resolution mismatches between Bun and TS 7 compiler.
  - [Mitigation] Verify that tsconfig.base.json and package path mappings are correctly resolved.

## Adversarial review and mitigations

### Resource and Performance Overhead

- _Risk_: A new compiler version could increase memory usage or introduce performance regression on large codebases.
- _Mitigation_: The Go-based TS 7 compiler has a significantly smaller memory footprint and delivers 8x-12x build performance improvements, resulting in a net reduction in resource usage.

### Failure Modes and Edge Cases

- _Risk_: Third-party package typings (like React or Node types) might be incompatible with TS 7 type inference, resulting in type errors outside our control.
- _Mitigation_: If typing errors occur within third-party packages, we will use `@ts-expect-error` comments accompanied by descriptive justifications, conforming to Canopy's linting guidelines.

### Security and Isolation

- _Risk_: A major version upgrade in the npm package registry could introduce supply chain risks if a compromised or unofficial package is selected.
- _Mitigation_: We will specify the official Microsoft package name `typescript` and install it using Bun's lockfile mechanism to ensure integrity.

### Migration and Compatibility

- _Risk_: Developer editors (like VS Code) might default to an older TypeScript version, reporting errors that do not align with the TS 7 compiler.
- _Mitigation_: The root `.vscode/settings.json` (if present) or editor settings should be updated to use the workspace version of TypeScript.
- _Risk_: Custom type guards or complex branded types in Canopy might fail due to type checker refinement changes in TS 7.
- _Mitigation_: We will systematically inspect typecheck logs and adapt type definitions to satisfy the new rules while maintaining the exact same runtime behavior.

## Amendments (2026-07-29, canopy-1qb)

**The plain version-bump plan in tasks.md (1.1: "update `typescript` to `7.0.2`") was never actually executed, and what was implemented instead was broken.**
TypeScript 7.0 ships without the old programmatic compiler API, which `typescript-eslint` depends on — confirmed via Microsoft's [TS 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and a live typescript-eslint issue ([#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)) reproducing the exact same crash/peer-dependency conflict this repo would have hit.
Microsoft's own recommended interim workaround is a dual-package alias: keep plain `typescript` on 6.x (for tool compatibility) and alias the fast native 7.x compiler under a different devDependency name for the actual build.
The implementation that landed followed that same shape but got the details wrong: it pinned `typescript-native` to `npm:typescript@7.0.1-rc` (a stale release candidate, not the GA `7.0.2`), and wired the swap through a `postinstall` script (`ln -sf ../typescript-native/bin/tsc node_modules/.bin/tsc`) that could never run in this repo — `bunfig.toml` has had `[install] ignoreScripts = true` since PR #197, well before this change, which unconditionally blocks every lifecycle script (including the root project's own) on every install, not just on a lockfile-unchanged cache hit. Verified empirically: a test postinstall never fired even under a full `bun install --force`. So `tsc` always fell back to plain 6.0.3, and tasks 1.2/1.3/2.1/2.2 (compile/typecheck/test/lint gates "under TS 7") were never actually exercised against the native compiler.

**Fix applied:** bumped `typescript-native` to stable `npm:typescript@7.0.2`, dropped the `postinstall` symlink race entirely, and instead prefix the root `build`/`typecheck` scripts with `PATH="$PWD/node_modules/typescript-native/bin:$PATH"`, which propagates deterministically through every `bun --filter` fan-out without touching `node_modules/.bin/tsc` (so `typescript-eslint`'s `require('typescript')` resolution stays on plain 6.0.3, unaffected). Verified clean `build`/`typecheck`/`lint`/`test` runs under this wiring.

**Still open:** this remains an interim workaround. Microsoft has committed to shipping the real programmatic API in TypeScript 7.1 (~3-4 months after 7.0), at which point `typescript-eslint` is expected to add proper support and the dual-package split can be dropped in favor of a single `typescript` devDependency. Tracked as a follow-up bead, not part of this change.

See `docs/architecture/decisions.md` (2026-07-29 entry) and beads issue `canopy-1qb`.
