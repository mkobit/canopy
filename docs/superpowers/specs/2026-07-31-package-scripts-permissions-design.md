# Package scripts permission auto-approval design

## Overview
Configure project permission rules to allow auto-approval for explicit `package.json` `bun run` scripts across agent workflows (`Claude Code` and `Antigravity CLI`).

## Requirements and security constraints
1. **Strict explicit matching (no wildcards)**:
   - Prohibit wildcard (`*`) patterns in permission rules to prevent command line prompt injection vulnerabilities.
   - Enumerate exact command strings for all monorepo `package.json` scripts.
2. **Project scope**:
   - Limit auto-approval permission rules strictly to commands within the project repository workspace.

## Permission specification

### 1. Claude Code project configuration (`.claude/settings.json`)
The `.claude/settings.json` file is checked into version control to provide consistent permission rules across environments.

Explicit `permissions.allow` rules to include:
- `Bash(bun run build)`
- `Bash(bun run lint)`
- `Bash(bun run typecheck)`
- `Bash(bun run test)`
- `Bash(bun run format)`
- `Bash(bun run dev)`
- `Bash(bun run check:api-compatibility)`
- `Bash(bun run check:versions)`
- `Bash(bun run check:openspec-changes)`
- `Bash(bun run audit:ai-tools)`
- `Bash(bun run storybook)`
- `Bash(bun run build-storybook)`
- `Bash(bun run codegen:wit)`
- `Bash(bun run package:plugin)`
- `Bash(bun run test:e2e)`
- `Bash(bun run --cwd apps/web codegen:wit)`

### 2. Local settings synchronization (`.claude/settings.local.json`)
Ensure local developer settings mirror the explicit, non-wildcard script entries without wildcard patterns.

### 3. Antigravity CLI permission handling
Antigravity CLI manages permissions via runtime `ask_permission` calls. System settings files (`~/.gemini/config/config.json`) are sandboxed from direct agent edits for safety. To support seamless execution, permission requests in Antigravity will target exact command strings.

## Verification plan
1. Run `prettier --check .claude/settings.json` to ensure valid JSON formatting.
2. Run `bun run lint` and `bun run typecheck` to verify commands run smoothly.
