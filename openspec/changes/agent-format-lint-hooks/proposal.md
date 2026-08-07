## Why

Currently, edits made by AI agents (Antigravity and Claude Code) require manual format and lint steps or git pre-commit checks to catch formatting or linting errors.
In addition, agents frequently trigger manual permission approval prompts when executing routine workspace commands (`bun run ...`, `git ...`, `bd ...`), causing unnecessary interruptions.
We need post-tool-use agent edit hooks that automatically format and lint modified files on edit, plus comprehensive permission whitelist configurations for both Antigravity and Claude Code environments.

## What Changes

- **Agent auto-format & lint hook**: Create `tools/hooks/agent-format-lint-hook.ts` (authored in TypeScript, executed via Bun) that receives modified file paths from agent PostToolUse hook payloads, runs `prettier --write <file>` on supported files, and runs `eslint --fix <file>` on JS/TS files.
- **Claude Code hook configuration**: Update `.claude/settings.json` to register `agent-format-lint-hook.ts` under `PostToolUse` for `Edit|Write|MultiEdit` tool invocations.
- **Antigravity hook configuration**: Create/update `.gemini/settings.json` (or `.gemini/config.json`) to register `agent-format-lint-hook.ts` for file modification tool calls.
- **Permission whitelist rules**: Expand permission whitelist rules in `.claude/settings.json`, `.claude/settings.local.json`, and `.gemini/settings.json` to allow auto-approval for standard project commands (`bun run build`, `bun run lint`, `bun run format`, `bun run test`, `bun run typecheck`, `bd ...`, `git ...`, etc.).
- **Auto-format settings files on edit (`canopy-qvn.4.1`)**: Ensure formatting hooks process `.claude/settings.json` and `.claude/settings.local.json` with Prettier upon modification.

## Capabilities

### New Capabilities

- `agent-auto-format-lint-hooks`: Automatic formatting (Prettier) and auto-fixing (ESLint) for modified files triggered by agent edit tools.
- `agent-permission-whitelist-rules`: Pre-configured permission whitelist rules for Antigravity and Claude Code to auto-approve safe project workflow commands.

### Modified Capabilities

- `openspec-validate-hook`: Works alongside `agent-format-lint-hook` in PostToolUse sequence.

## Impact

- `tools/hooks/agent-format-lint-hook.ts`: New script for running file-scoped formatting and linting.
- `.claude/settings.json` & `.claude/settings.local.json`: Added `agent-format-lint-hook.ts` to `PostToolUse` and comprehensive permission whitelist rules.
- `.gemini/settings.json`: Added `agent-format-lint-hook.ts` and permission whitelist rules for Antigravity.
