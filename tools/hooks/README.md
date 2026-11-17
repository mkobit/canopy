# Tooling hooks

## Overview

This directory contains a Bun TypeScript `PostToolUse` hook script that reads tool-input JSON from `Bun.stdin` and exits `0`: `agent-format-lint-hook.ts` formats and lints modified files in place via `prettier` and `eslint`.

## Interface

- `[agent-format-lint-hook.ts:rootDirectory]` Exported constant resolving two directories above the script.
- `[agent-format-lint-hook.ts:ToolInput]` Exported `readonly` type `{ file_path?: string; edits?: readonly Readonly<{ file_path?: string }>[]; }`.
- `[agent-format-lint-hook.ts:HookPayload]` Exported `readonly` type `{ tool_input?: ToolInput; }`.
- `[agent-format-lint-hook.ts:extractFilePathsFromPayload]` `(payload: HookPayload) => readonly string[]`.
- `[agent-format-lint-hook.ts:isPrettierSupported]` `(filePath: string) => boolean`.
- `[agent-format-lint-hook.ts:isEslintSupported]` `(filePath: string) => boolean`.

## Invariants

- `[agent-format-lint-hook.ts:extractFilePathsFromPayload]` Deduplicates paths, resolves relative paths against `rootDirectory`, and retains only existing regular files inside `rootDirectory`.
- `[agent-format-lint-hook.ts:isPrettierSupported]` Accepts only case-insensitive `.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.md`, `.css`, `.yaml`, `.yml`; `[agent-format-lint-hook.ts:isEslintSupported]` accepts `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`.
- `[agent-format-lint-hook.ts:main]` Always exits with code `0`; only runs when `import.meta.main` is true.

## Side Effects

- `[agent-format-lint-hook.ts:runFormatAndLint]` Spawns `bunx prettier --write` and `bunx eslint --fix --cache` in `rootDirectory` (modifying files and ESLint cache) and logs failures via `console.error`.

## Verification

- Run: `bun test`
