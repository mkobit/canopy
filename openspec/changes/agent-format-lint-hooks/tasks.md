# Tasks: Agent auto-format & lint hooks with permission whitelist rules

- [ ] 1. Create `tools/hooks/agent-format-lint-hook.ts` to parse agent stdin payloads, run `prettier --write` and `eslint --fix` on modified files, and log warnings gracefully on syntax errors.
- [ ] 2. Update `.claude/settings.json` to register `agent-format-lint-hook.ts` under `PostToolUse` for `Edit|Write|MultiEdit` tool matchers.
- [ ] 3. Create/update `.gemini/settings.json` to register `agent-format-lint-hook.ts` and Antigravity permission whitelist rules.
- [ ] 4. Update `.claude/settings.json` and `.claude/settings.local.json` permission whitelist rules for all standard workspace commands (`bun run ...`, `git ...`, `bd ...`).
- [ ] 5. Test auto-formatting of `.claude/settings.json` and `.claude/settings.local.json` (`canopy-qvn.4.1`) and verify clean lint/build pass.
