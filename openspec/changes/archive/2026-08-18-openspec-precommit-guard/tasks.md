## 1. Wire the guard into pre-commit

- [x] 1.1 Add `bun run check:openspec-changes` to `.husky/pre-commit` after the existing `bun run check:versions` line
- [x] 1.2 Confirm no other file needs edits — `tools/check-openspec-changes.ts`, `tools/lib/openspec-change.ts`, the `check:openspec-changes` `package.json` alias, `.github/workflows/ci.yml`'s `openspec/**` `paths-ignore`, and `.github/workflows/openspec.yml` all stay unchanged (Decisions 1–3)

## 2. Validate and land

- [x] 2.1 Manually verify the hook fires: stage an intentionally invalid OpenSpec change (e.g. a `proposal.md` with no matching `specs/` delta) under `openspec/changes/<throwaway>/`, run `git commit` (or `.husky/pre-commit` directly), confirm non-zero exit naming the change and validator output; `git reset` and remove the throwaway change
- [x] 2.2 Manually verify the no-op path: stage a change to a non-OpenSpec file only, confirm the hook exits 0 without invoking `bunx openspec validate`
- [x] 2.3 Manually verify `git commit --no-verify` still bypasses the hook (Decision 5 escape hatch) — git built-in behavior, not exercised via a real commit
- [x] 2.4 Run `bunx openspec validate openspec-precommit-guard --strict`
- [x] 2.5 Run full `bun run build && bun run lint && bun run typecheck && bun test`; confirm green (this change touches no source, only `.husky/pre-commit`). One unrelated pre-existing failure found and confirmed out of scope: `query-session-projection.load.test.ts` SLA flake on this machine, filed as `canopy-8hw`
