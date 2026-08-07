# Design: Agent auto-format & lint hooks with permission whitelist rules

## Context

Bead `canopy-qvn.4` (and child `canopy-qvn.4.1`).
This design details the implementation of agent post-tool-use hooks to automatically format (Prettier) and auto-fix (ESLint) files edited by agents (Claude Code and Antigravity). It also covers comprehensive permission whitelist configurations to minimize manual approval prompts for standard developer tooling commands.

## Goals & Non-Goals

### Goals

- Create `tools/hooks/agent-format-lint-hook.ts` in TypeScript executed via Bun.
- Extract touched file paths from stdin JSON payload (supporting direct file paths and `edits` arrays).
- Format supported modified files (TS, TSX, JS, JSX, JSON, MD, CSS, YAML) using `prettier --write <path>`.
- Auto-fix JS/TS files using `eslint --fix --cache <path>`.
- Wire `agent-format-lint-hook.ts` into `.claude/settings.json` and `.gemini/settings.json` under `PostToolUse` for edit/write tool matchers.
- Ensure `.claude/settings.json` and `.claude/settings.local.json` are auto-formatted with Prettier on edit (`canopy-qvn.4.1`).
- Configure permission whitelist rules across `.claude/settings.json`, `.claude/settings.local.json`, and `.gemini/settings.json` to allow auto-approval for safe workspace commands (`bun run ...`, `git ...`, `bd ...`).

### Non-Goals

- Blocking file save operations if non-auto-fixable ESLint errors remain (formatting and auto-fixes are applied in-place; remaining errors surface during CI/lint checks).
- Full monorepo build or full project lint on every individual file edit (hooks must be file-scoped and fast).

## Decisions

### Decision 1: Shared TypeScript hook script over Bun

We implement `tools/hooks/agent-format-lint-hook.ts` using Bun's runtime, following `.agents/AGENTS.md` rules.
The script parses standard input JSON passed by agent `PostToolUse` hooks, extracts unique valid relative or absolute file paths existing in the repository, and executes scoped formatting and auto-fixing.

### Decision 2: Scoped execution per modified file

To avoid performance degradation during interactive agent sessions, `agent-format-lint-hook.ts` does NOT run `bun run format` or `eslint .` globally.
Instead, it passes only the specific touched file paths to `prettier --write` and `eslint --fix`.

### Decision 3: Non-blocking graceful exit

If formatting or auto-fixing fails (e.g. syntax error in a mid-edited file), the hook logs a warning message and exits with status 0. It does NOT return `decision: block`, allowing the agent to continue fixing the file without being blocked by temporary syntax errors.

### Decision 4: Mirrored settings & permission whitelist rules

We configure permission whitelist rules in `.claude/settings.json`, `.claude/settings.local.json`, and `.gemini/settings.json` covering:

- `bun run build`, `bun run lint`, `bun run test`, `bun run format`, `bun run typecheck`
- `bun tools/*` scripts
- `git` read/write operations (`git status`, `git add`, `git diff`, `git commit`, etc.)
- `bd` issue management commands (`bd prime`, `bd show`, `bd ready`, `bd update`, `bd close`, etc.)

## Adversarial review and mitigations

### 1. Resource and Performance Overhead

- **Risk**: Running Prettier and ESLint on every tool edit call could introduce latency (e.g., 1-2s delay per file edit).
- **Mitigation**: Filter out non-existent files and non-code files early. Scope `prettier` and `eslint` strictly to the target file paths. Pass `--cache` flag to ESLint to avoid re-parsing unchanged AST nodes.

### 2. Failure Modes and Edge Cases

- **Risk 1**: Hook receives invalid JSON or empty stdin payload from an agent platform.
- **Mitigation 1**: Safely wrap JSON parsing in a `try/catch` block, defaulting to an empty file list and exiting 0 gracefully.
- **Risk 2**: File contains temporary syntax errors while an agent is making partial edits, causing Prettier/ESLint to fail.
- **Mitigation 2**: Non-zero exits from Prettier or ESLint are caught, logged to stderr as diagnostic warnings, and the hook exits 0 so tool execution is not crashed or blocked.
- **Risk 3**: Editing `.claude/settings.json` triggers the hook, which formats `.claude/settings.json`, triggering an infinite recursive loop.
- **Mitigation 3**: The hook script ignores re-entrant execution and runs synchronously once per tool event.

### 3. Security and Isolation

- **Risk**: An agent could attempt to pass arbitrary shell arguments or path traversal sequences in `file_path`.
- **Mitigation**: Validate that file paths are within `rootDirectory` using `path.resolve` and `path.relative` checking. Pass file paths safely as discrete string arguments to `Bun.spawn`, avoiding raw shell string concatenation (`sh -c`).

### 4. Migration and Backward Compatibility

- **Risk**: Existing hook (`tools/hooks/openspec-validate-hook.ts`) might collide or fail if executed in sequence with `agent-format-lint-hook.ts`.
- **Mitigation**: Hooks are defined as separate array items under `PostToolUse` in `.claude/settings.json` and `.gemini/settings.json`. Each operates independently and handles its own errors.
