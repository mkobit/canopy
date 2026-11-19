# Tooling library modules

## Overview

This directory contains TypeScript utility modules supporting repository checks and automation: TypeSpec `canopy.v0` parsing and deterministic code generation, TypeSpec/WIT backward-and-forward API schema compatibility checking, Beads audit and merge-drift parsing, TypeScript source import boundary enforcement, and AST-based duplicate-type and import refactoring.

## Interface

- `[typespec-compiler.ts:TypeSpecScalar, TypeSpecEnumMember, TypeSpecEnum, TypeSpecField, TypeSpecModel, TypeSpecHttpMethod, TypeSpecOperation, TypeSpecNamespace, TypeSpecWitInterface, TypeSpecWitWorld, TypeSpecServiceIr, TypeSpecParseResult, TypeSpecCodegenArtifacts, parseTypeSpecService, emitCanopyV0ContractModule, emitUnifiedWitSpec, emitCanopyWitSpecModule, emitTypeSpecBaselineJson, generateAllCodegenArtifacts, getDefaultTypeSpecSourcePath, loadAndParseTypeSpecFromDisk]` Parser and code generator for `packages/graph-access/typespec/main.tsp`.
- `[api-compatibility-checker.ts:CompatibilityProtocol, Violation, Waiver, CheckOptions, checkTypeSpec, checkApiCompatibility]` Backward and forward wire-compatibility checker across TypeSpec `canopy.v0` and WASM WIT schemas, plus codegen drift checks.
- `[beads-audit.ts:LintFinding, parseLintOutput, QueryIssueSummary, parseQueryOutput, parseIssueNumbers, FindingCheck, Finding, lintFindingsToReportFindings, queryFindingsToReportFindings, AuditResult, buildAuditResult, formatReportBody]` Beads audit parser and report builder.
- `[beads-merge-check.ts:ClosedIssue, isCheckable, issueIdPattern, isReachable, DriftedIssue, findDriftedIssues, parseCommitMessages, parseClosedIssues]` Closed-bead commit reachability checker.
- `[source-import-boundaries.ts:SourceAlias, SourceImportBoundary, SourceImportViolation, findForbiddenImportsInSource, readTypescriptAliases, checkSourceImportBoundaries]` Production source import boundary checker.
- `[ts-refactoring.ts:DuplicateTypeInfo, DuplicateTypeGroup, UnindexedImportInfo, RefactorOptions, RefactorReport, normalizeStructure, parseSourceFile, analyzeDuplicateTypesInFile, analyzeUnindexedImportsInFile, rewriteUnindexedImportsInContent, findSourceFiles, runTsRefactoring]` AST-based duplicate type and unindexed `@canopy/*/(src|dist)/*` import analyzer/rewriter.

## Invariants

- `[api-compatibility-checker.ts:checkApiCompatibility]` Evaluates waiver expiration against `Temporal.Now.plainDateISO().toString()`, rejects `UNDEPRECATED_REMOVAL` even when a matching waiver exists, and sets `success = true` only when `unhandledViolations`, `expiredWaivers`, and `staleWaivers` are empty.
- `[beads-audit.ts:buildAuditResult]` Sets `failed = true` only for `lintFindings` and `labelFindings`; `[beads-merge-check.ts:isCheckable]` exempts `'no-code'`, includes `'code-bearing'`, and defaults to `['task', 'bug', 'feature', 'chore']`.
- `[source-import-boundaries.ts:listProductionFiles]` Collects `.ts`/`.tsx`/`.mts`/`.cts` files excluding `--tests--` and `.test.ts`/`.test.tsx`, checking static imports/exports, `import('...')` type nodes, and dynamic `import('...')` calls.
- `[ts-refactoring.ts:rewriteUnindexedImportsInContent]` Rewrites specifiers in descending start-offset order to preserve earlier offsets; scans only `packages/`, `apps/`, and `tools/`.

## Side Effects

- `[typespec-compiler.ts:loadAndParseTypeSpecFromDisk]`, `[api-compatibility-checker.ts:checkApiCompatibility]`, `[source-import-boundaries.ts]`, `[ts-refactoring.ts]` Synchronously read files and directories from disk; `runTsRefactoring` synchronously overwrites files via `fs.writeFileSync` when `options.fix` is truthy.

## Verification

- Run: `bun test`
