## Context

The packaging/dev-tooling review track `canopy-08x` (whole-system review epic `canopy-v9o`) found, as finding F2, that `tools/check-openspec-changes.ts` — a working guard that strict-validates OpenSpec changes in a staged diff, exposed as `bun run check:openspec-changes` — is wired into no automation path. It runs nowhere: not `.husky/pre-commit` (which runs only `bun run check:versions`), not the `bun run lint` chain. It was planned in `docs/superpowers/plans/2026-07-31-*` but never landed. The only non-CI validator of OpenSpec changes is `tools/hooks/openspec-validate-hook.ts`, a Claude Code hook — Claude-agent-only, invisible to a human or non-Claude-agent contributor.

**The bead's framing is partly stale, and the design corrects it.** F2's premise was "an OpenSpec-only PR runs zero validation from a non-agent path." That is no longer true: `.github/workflows/openspec.yml` (PR #476, merged 2026-08-16 — the same day the finding was written) runs `bunx openspec validate --all` on every `push`/`pull_request` whose diff touches `openspec/**` or the workflow file itself. A non-agent CI path already exists and already covers the "at least one non-agent automation path" half of the acceptance criteria. `.github/workflows/ci.yml` separately `paths-ignore`s `openspec/**` (plus `docs/design/**`, `docs/architecture/**`, `docs/research/**`, `**/AGENTS.md`, `.claude/**`, `.jules/**`, `.gemini/**`), so the main build→lint→typecheck→test pipeline does not run for an OpenSpec-only diff — correctly, since `openspec.yml` owns that surface.

The **actual remaining gap** F2 closes is therefore not "zero validation" but **latency and reach**: CI validation arrives minutes after a push, and only after a push. A contributor authoring a change — especially a human or non-Claude agent who does not have the Claude-only hook — gets no local signal that a change is malformed until CI fails on the PR. Wiring the already-working `check:openspec-changes` into `.husky/pre-commit` gives that signal at commit time, on every machine.

This is a gating check, so per `feedback_measure_before_gating_ci_checks` it was dry-run against `main` before being specced (see the dry-run result below).

**Strictness asymmetry discovered.** `check-openspec-changes.ts` runs `bunx openspec validate <name> --strict` (per `tools/lib/openspec-change.ts`), but `openspec.yml` runs `bunx openspec validate --all` **without** `--strict`. So the proposed pre-commit gate is _stricter_ than the existing CI gate: it can reject a change locally that CI's non-strict `--all` would accept. This is intentional (catch more, earlier) but is called out as Decision 4 and Open Questions so it is a chosen asymmetry, not an accident.

**Dry-run result (against `main`, this change's investigation).** The pre-commit gate is safe to wire today with no remediation step. Every open change under `openspec/changes/` passes `--strict` right now:

```
property-type-constraints          → PASS (--strict)
queries-graph-session-benchmark    → PASS
storybook-setup                    → PASS
graph-wcag-accessibility           → PASS
graph-rendering-scalability        → PASS
agent-format-lint-hooks            → PASS
bun-css-bundler                    → PASS
bunx openspec validate --all --strict → ALL PASS
```

Unlike the sibling `codify-ci-tooling-guard` change (which found a live Bun-version drift in `openspec.yml` and had to remediate it before wiring), this change surfaces **no true-positive failure** on `main`. The gate is green at gate-time the moment it is wired; no remediation commit is required. This satisfies the measure-before-gating rule with a clean baseline.

## Goals / Non-Goals

**Goals:**

- Give human and non-Claude-agent contributors the same local OpenSpec validation the Claude-only hook already provides, at commit time, before a push.
- Reuse the existing, working `check:openspec-changes` script and its `tools/lib/openspec-change.ts` helper unchanged — this is a wiring change, not a script change.
- Keep the hook staged-diff-scoped so it validates only the change(s) being committed and is a no-op for unrelated commits.
- Record an explicit decision on `ci.yml`'s `openspec/**` `paths-ignore` (keep it) and on whether to also wire the check into `bun run lint` (do not).

**Non-Goals:**

- Changing `tools/check-openspec-changes.ts` or `tools/lib/openspec-change.ts` behavior (staged-diff scope, `--strict`, per-change reporting all stay).
- Changing `openspec.yml`'s CI validation (it keeps running `validate --all`; whether it should add `--strict` for parity is an Open Question, not part of this change).
- Removing or narrowing `ci.yml`'s `paths-ignore` for `openspec/**` — that pipeline should stay skipped for OpenSpec-only diffs.
- Retiring the Claude-only `tools/hooks/openspec-validate-hook.ts` — it and the pre-commit hook are complementary (agent-loop feedback vs commit-time gate); consolidating them is out of scope.

## Decisions

### Decision 1: wire into `.husky/pre-commit` (staged-scoped), not into `bun run lint`

The check is added to `.husky/pre-commit` after the existing `bun run check:versions` line. It is **not** added to the `bun run lint` chain.

- **Why**: `check:openspec-changes` is designed staged-diff-scoped — it reads `git diff --cached --name-only` and validates only the changes actually being committed. That is exactly the pre-commit contract: fast, targeted, no-op when no OpenSpec file is staged. Wiring it into `lint` would mismatch its shape twice over: (a) `lint` has no concept of a staged diff, so to be useful there it would have to validate repo-wide (`--all`), duplicating precisely what `openspec.yml` already runs in CI; and (b) it would then run on every `bun run lint` invocation — including the CI `Lint` step and every local lint of unrelated code — validating in-flight changes a contributor has not touched and slowing the common path for no new coverage. Pre-commit gives the fast-local-feedback the gap actually needs; `lint`-wiring would be redundant with `openspec.yml` and impose cost on unrelated work.
- **Alternative considered**: wire into both pre-commit and `lint` (matching how `check:ci-tooling`, `check:dependency-graph`, and friends sit in the `lint` chain). Rejected: those guards are inherently repo-wide invariants with no cheaper staged form, so `lint` is their only home. `check:openspec-changes` has a natural staged form and a CI twin already; adding it to `lint` buys duplicate coverage at a recurring cost. The `lint`-guard pattern is not a reason to add a check that already has better-fitting homes (pre-commit for local, `openspec.yml` for CI).

### Decision 2: keep `ci.yml`'s `openspec/**` `paths-ignore` unchanged

`.github/workflows/ci.yml` keeps ignoring `openspec/**` on both `push` and `pull_request`.

- **Why**: `openspec.yml` already validates every change on any `openspec/**` diff via its own narrow `paths:` allowlist. The build→lint→typecheck→test pipeline in `ci.yml` compiles and tests source packages; an OpenSpec-only diff changes no TypeScript, so running that pipeline for it would burn CI minutes (two-OS matrix, full build) to re-verify code the diff did not touch. The two workflows partition the surface cleanly: `openspec.yml` for `openspec/**`, `ci.yml` for everything else. The existence of the dedicated `openspec.yml` workflow is precisely what makes the `ci.yml` ignore correct, not something that calls it into question.
- **Alternative considered**: drop `openspec/**` from `ci.yml`'s `paths-ignore` so the main pipeline also runs on OpenSpec diffs. Rejected: it duplicates `openspec.yml`'s job with a far heavier (and slower, matrixed) pipeline that validates nothing OpenSpec-specific, and would re-run the whole build/test suite for doc-shaped changes — the opposite of what the `paths-ignore` list was curated to avoid.

### Decision 3: reuse the existing script unchanged — this is a wiring-only change

`tools/check-openspec-changes.ts` and `tools/lib/openspec-change.ts` are not modified. The `check:openspec-changes` `package.json` alias already exists. The only edited file is `.husky/pre-commit`.

- **Why**: the script already does the right thing (staged-diff extraction via `uniqueChangeNamesFromPaths`, per-change `--strict` validation, per-failure diagnostics, correct exit codes) and was verified by the dry-run. Adding behavior would expand the surface of a change whose entire point is to connect an existing, tested tool to an existing hook. Minimum diff for the task.
- **Alternative considered**: refactor the script to share code with the Claude-only `openspec-validate-hook.ts` while wiring it. Rejected: scope creep; the two entry points have different inputs (staged diff vs agent-provided paths) and consolidating them is a separate concern, not required to close F2.

### Decision 4: pre-commit keeps `--strict`, accepting it is stricter than CI's non-strict `validate --all`

The hook inherits the script's existing `bunx openspec validate <name> --strict`. This is _stricter_ than `openspec.yml`'s `bunx openspec validate --all` (no `--strict`), so a change can be rejected at commit that CI's `--all` would accept.

- **Why**: the whole value of a local pre-commit gate is catching more, earlier — a strict local check that a non-strict CI would miss is a feature, not a bug, and the dry-run confirms every current change passes `--strict`, so there is no live cost to strictness today. Relaxing the local hook to match CI's non-strict `--all` would weaken the exact fast-feedback signal the gap needs, for no benefit.
- **Trade-off / mitigation**: the asymmetry means a strict-only failure surfaces locally but not in CI, which could confuse a contributor comparing the two. Mitigated by the self-describing failure message (the script prints the change name and full validator output, and tells the author to run `bunx openspec validate <name>` for details) and by raising CI-parity as an Open Question (should `openspec.yml` also adopt `--strict`).
- **Alternative considered**: relax the pre-commit hook to non-strict to exactly mirror CI. Rejected: it throws away local coverage to match the _weaker_ of the two gates; the correct direction for parity, if pursued, is making CI stricter, not the local hook weaker.

### Decision 5: `--no-verify` is the sanctioned escape hatch for in-progress authoring

A contributor who deliberately needs to commit an incomplete change (e.g. a proposal drafted before its `specs/` delta exists, which fails `--strict` because a change must carry at least one delta with a scenario) uses `git commit --no-verify`, consistent with how every husky pre-commit gate already behaves.

- **Why**: `--strict` requires a structurally complete change (a `specs/` delta with `## ADDED/MODIFIED/...` requirements, each with a `#### Scenario:`). During hand-authoring, an early snapshot may legitimately not meet that bar yet. Blocking such a commit outright would push people toward habitual `--no-verify` and undermine the guard; instead, `--no-verify` is the explicit, occasional escape, and the pushed change is still caught by `openspec.yml` in CI — so nothing invalid reaches `main` merged. Crucially, the staged-diff scope means the hook only ever validates changes the contributor is _actively touching_: work on unrelated files is never blocked because some other change elsewhere is mid-draft. In practice the normal authoring path (`opsx:propose`) emits a complete, strict-valid change in one step, so this escape is rare.
- **Alternative considered**: make the pre-commit check non-strict (or warn-only) to avoid ever blocking WIP. Rejected: a warn-only hook provides no gate; non-strict re-opens Decision 4. The `--no-verify` + CI-backstop combination keeps the strict local signal while leaving an honest, visible escape for the rare incomplete snapshot.

## Risks / Trade-offs

- **Strict pre-commit blocks a legitimately incomplete in-progress change** (Decision 5) → mitigated: staged-diff scope means only the change being touched is validated (unrelated work is never blocked); `git commit --no-verify` is the sanctioned escape; `openspec.yml` still validates on push so nothing invalid merges; the normal `opsx:propose` path produces strict-valid changes in one step.
- **Local/CI strictness asymmetry confuses contributors** (Decision 4) → mitigated: self-describing failure output names the change and points at `bunx openspec validate <name>`; CI-parity is tracked as an Open Question.
- **Per-commit latency** → mitigated: the check is a no-op for any commit that stages no `openspec/changes/` file (the common case for code work), and validates only the touched change(s), not the whole repo — bounded to one `bunx openspec validate` per touched change.
- **`bunx openspec` cold-start / network** → the `@fission-ai/openspec` binary is a repo devDependency already installed by `bun install`; `bunx` runs the local binary (the same invocation `openspec.yml` and the Claude hook use), so there is no per-commit download. If `node_modules` is absent the hook errors loudly, same environment assumption as `check:versions`.
- **Duplicate validation (pre-commit + CI)** → accepted and intentional: pre-commit is the fast local signal, `openspec.yml` is the authoritative merge gate; the redundancy is defense in depth, and pre-commit is skippable via `--no-verify` whereas CI is not.

## Migration Plan

1. Land in one PR: add a single `bun run check:openspec-changes` line to `.husky/pre-commit` after `bun run check:versions`. No script, `package.json`, or workflow edits (the script and alias already exist; the dry-run shows the gate is green on `main`).
2. Rollback = delete that one line from `.husky/pre-commit`. No data, API, workflow, or script surface touched.
3. Contributor-facing change: one new local failure mode (a commit staging an invalid OpenSpec change is rejected with the change name and validator output), escapable via `git commit --no-verify`; the finding's decision on `ci.yml` `paths-ignore` (keep it) and `lint` (do not wire) is recorded here.

## Adversarial review and mitigations

**Resource / performance overhead.**
The hook runs once per commit. For the common case — a commit that stages no `openspec/changes/` file — `uniqueChangeNamesFromPaths` returns empty and the script `process.exit(0)`s before spawning any validator, so the added cost is one `git diff --cached --name-only` and a Bun script start (sub-second, no OpenSpec invocation). For a commit that does touch OpenSpec, cost is one `bunx openspec validate <name> --strict` per distinct touched change (deduplicated via a `Set`), reading only that change's files — bounded and local, not a repo-wide `--all`. The `bunx` target is the already-installed devDependency binary, so there is no per-commit network fetch. No TypeScript program or type-aware pass is loaded (unlike the eslint step it does _not_ join, per Decision 1), so there is no heap pressure on commit. Net overhead is negligible for code commits and small-and-bounded for OpenSpec commits.

**Edge cases / failure modes.**

- _Commit touches no OpenSpec change_: no-op, early `exit(0)` — the dominant case and cheapest path.
- _Commit touches only `openspec/changes/archive/*`_: the `CHANGE_PATH_PATTERN` in `openspec-change.ts` has a `(?!archive\/)` negative lookahead, so no change name is extracted and the check is a no-op — archived changes are never re-validated.
- _Multiple changes staged in one commit_: each distinct change is validated independently; `failures` aggregates and all failing changes are reported at once, not just the first.
- _Deleted-only change_ (`--diff-filter=ACMR` excludes deletions): a change whose files are only removed is not validated, which is correct — a removed change has nothing to validate.
- _Incomplete change mid-authoring fails `--strict`_: handled by Decision 5 (`--no-verify` escape + CI backstop); staged scope guarantees unrelated work is never collateral-blocked.
- _`bunx openspec` unexpected crash_: the script's top-level `.catch` prints `check-openspec-changes: unexpected error` and `exit(1)`, failing the commit closed rather than passing silently on an internal error — the safe direction for a gate.
- _Rename of a change directory_ (`R` in the filter): the new path is matched by the pattern and validated under the new name; the old path (a deletion) is excluded, which is correct.

**Security / isolation.**
Dev-tooling only — no runtime, network data-plane, or user-data surface. The hook reads the local git index (`git diff --cached`) and runs the locally-installed `bunx openspec` binary; no remote code is fetched at commit time (the binary is a pinned devDependency, installed by `bun install`, the same one CI and the Claude hook use). It performs no writes and introduces no privileged execution. `git commit --no-verify` is a standard, visible bypass — it does not weaken the CI gate (`openspec.yml` runs regardless of any local hook), so the authoritative merge-time validation cannot be skipped by a local flag. The trust value is defensive: it stops a malformed OpenSpec change from entering a contributor's history and reaching review, catching it before push rather than minutes later in CI.

**Migration / backward compatibility.**
Additive and reversible: the sole edit is one line in `.husky/pre-commit`; rollback is deleting that line. No script, `package.json`, or workflow file changes, so there is no interface for downstream tooling to break. The measure-before-gating requirement is satisfied with a _clean_ baseline — the dry-run shows every open change (and `validate --all --strict`) passes on `main` today, so wiring the gate does not require any remediation commit and cannot break the first post-wiring commit for existing changes. Pre-release status (`canopy-pre-release-no-real-users`) means no user data, vault, or published API is touched; the only downstream is contributor commit flow, covered by the self-describing failure message and the `--no-verify` escape. The Claude-only `openspec-validate-hook.ts` is untouched and continues to work; the two validators coexist.

## Open Questions

- **CI strictness parity**: should `.github/workflows/openspec.yml` adopt `--strict` (i.e. `bunx openspec validate --all --strict`) so CI matches the pre-commit hook's strictness (Decision 4)? The dry-run shows `validate --all --strict` passes on `main` today, so it would be safe to flip now — but it is a change to a different workflow and a separate acceptance surface, so it is deferred out of this change rather than bundled. Recommend filing a follow-up if the local/CI asymmetry proves confusing in practice.
- **Consolidating the two OpenSpec validators**: `tools/hooks/openspec-validate-hook.ts` (Claude-only) and `tools/check-openspec-changes.ts` (pre-commit) now overlap in intent. Worth a future look at whether the Claude hook should delegate to the shared `openspec-change.ts` helper so there is one validation implementation, but not required to close F2.
