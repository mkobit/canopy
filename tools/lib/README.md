# Tooling library modules

## Overview

This directory contains five TypeScript utility modules supporting repository checks and automation: API schema compatibility checking, Beads audit and merge-drift parsing, TypeScript source import boundary enforcement, and AST-based duplicate-type and import refactoring.

## Interface

- `[api-compatibility-checker.ts:Violation, Waiver, CheckOptions, checkIpc, checkApiCompatibility]` API baseline compatibility checker for Connect, GraphQL, OpenRPC, and WIT schemas.
- `[beads-audit.ts:LintFinding, parseLintOutput, QueryIssueSummary, parseQueryOutput, parseIssueNumbers, FindingCheck, Finding, lintFindingsToReportFindings, queryFindingsToReportFindings, AuditResult, buildAuditResult, formatReportBody]` Beads audit parser and report builder.
- `[beads-merge-check.ts:ClosedIssue, isCheckable, issueIdPattern, isReachable, DriftedIssue, findDriftedIssues, parseCommitMessages, parseClosedIssues]` Closed-bead commit reachability checker.
- `[source-import-boundaries.ts:SourceAlias, SourceImportBoundary, SourceImportViolation, findForbiddenImportsInSource, readTypescriptAliases, checkSourceImportBoundaries]` Production source import boundary checker.
- `[ts-refactoring.ts:DuplicateTypeInfo, DuplicateTypeGroup, UnindexedImportInfo, RefactorOptions, RefactorReport, normalizeStructure, parseSourceFile, analyzeDuplicateTypesInFile, analyzeUnindexedImportsInFile, rewriteUnindexedImportsInContent, findSourceFiles, runTsRefactoring]` AST-based duplicate type and unindexed `@canopy/*/(src|dist)/*` import analyzer/rewriter.

## Invariants

- `[api-compatibility-checker.ts:checkApiCompatibility]` Evaluates waiver expiration against hardcoded `now = '2026-07-25'` and sets `success = true` only when `unhandledViolations`, `expiredWaivers`, and `staleWaivers` are empty.
- `[beads-audit.ts:buildAuditResult]` Sets `failed = true` only for `lintFindings` and `labelFindings`; `[beads-merge-check.ts:isCheckable]` exempts `'no-code'`, includes `'code-bearing'`, and defaults to `['task', 'bug', 'feature', 'chore']`.
- `[source-import-boundaries.ts:listProductionFiles]` Collects `.ts`/`.tsx`/`.mts`/`.cts` files excluding `--tests--` and `.test.ts`/`.test.tsx`, checking static imports/exports, `import('...')` type nodes, and dynamic `import('...')` calls.
- `[ts-refactoring.ts:rewriteUnindexedImportsInContent]` Rewrites specifiers in descending start-offset order to preserve earlier offsets; scans only `packages/`, `apps/`, and `tools/`.

## Side Effects

- `[api-compatibility-checker.ts:checkApiCompatibility]`, `[source-import-boundaries.ts]`, `[ts-refactoring.ts]` Synchronously read files and directories from disk; `runTsRefactoring` synchronously overwrites files via `fs.writeFileSync` when `options.fix` is truthy.

## Verification

- Run: `bun test`
