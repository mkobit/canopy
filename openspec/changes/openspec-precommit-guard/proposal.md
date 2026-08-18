## Why

`tools/check-openspec-changes.ts` validates every OpenSpec change touched in a staged diff (`git diff --cached` → `uniqueChangeNamesFromPaths` → `bunx openspec validate <name> --strict` per change), is exposed as `bun run check:openspec-changes`, and works correctly — but it is wired into **no automation path**: not `.husky/pre-commit` (which runs only `bun run check:versions`), not the `bun run lint` chain, nowhere. The only non-CI thing that validates OpenSpec changes today is `tools/hooks/openspec-validate-hook.ts`, a Claude Code hook — Claude-agent-only, unavailable to a human or a non-Claude agent contributor.

The bead's original premise — "an OpenSpec-only PR runs zero validation from a non-agent path" — is now **stale**. `.github/workflows/openspec.yml` (PR #476, merged 2026-08-16) runs `bunx openspec validate --all` on every `openspec/**` push/PR, so a non-agent CI path already exists. What is still missing is **fast local feedback**: a human or non-Claude contributor editing a change gets no signal until CI runs minutes later, and `.github/workflows/ci.yml` deliberately `paths-ignore`s `openspec/**` (correctly — `openspec.yml` owns that surface).

This codifies finding F2 from `canopy-08x` by wiring the existing, working guard into `.husky/pre-commit` so a broken OpenSpec change is caught at commit time, on every contributor's machine, before it is ever pushed.

## What Changes

- Wire `bun run check:openspec-changes` into `.husky/pre-commit` (after the existing `check:versions` line), staged-diff-scoped so it validates only the change(s) actually being committed and is a no-op for commits that touch no `openspec/changes/` files. This is the single behavioral change; the script itself is unchanged.
- Record the decision that `.github/workflows/ci.yml`'s `paths-ignore` on `openspec/**` **stays as-is** — `openspec.yml` already provides the non-agent CI validation half of the acceptance criteria, so the main build→lint→typecheck→test pipeline does not need to run for an OpenSpec-only diff, and `check:openspec-changes` is **not** added to `bun run lint` (that would duplicate `openspec.yml`'s repo-wide `--all` in CI while slowing every local `lint` and validating unrelated in-flight changes).

## Capabilities

### New Capabilities

- `openspec-precommit-guard`: a pre-commit hook that runs `bun run check:openspec-changes` to strict-validate every OpenSpec change present in the staged diff, failing the commit with a per-change diagnostic if any change is invalid — giving human and non-Claude-agent contributors the same local validation the Claude-only hook already provides.

### Modified Capabilities

<!-- None. The check-openspec-changes script's behavior is unchanged; this change only wires it into an existing automation path. openspec.yml's CI validation and ci.yml's paths-ignore are unchanged. -->

## Impact

- `.husky/pre-commit` — one added line invoking `bun run check:openspec-changes` after `bun run check:versions`.
- `tools/check-openspec-changes.ts`, `tools/lib/openspec-change.ts`, `package.json` `scripts` — unchanged; the script and its `check:openspec-changes` alias already exist.
- `.github/workflows/openspec.yml`, `.github/workflows/ci.yml` — unchanged; the design records why the `openspec/**` `paths-ignore` stays.
- Contributors: a new local failure mode — a commit that stages an invalid OpenSpec change is rejected with the change name and validator output, escapable via `git commit --no-verify` for a deliberate work-in-progress snapshot.
- No runtime, API, or user-data surface; pre-release (`canopy-pre-release-no-real-users`).
