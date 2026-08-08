# Design: Beads CI validation and automated reporting

## Architecture

The beads validation workflow runs inside GitHub Actions as a standalone job.
It executes `bd` commands (`bd lint --json`, one failing `bd query` check, one informational-only `bd query` check) using Bun and installed repository tooling.
If the failing checks find anything, the workflow queries existing GitHub issues using `gh issue list` to prevent duplicate error reports before creating or updating a report issue.

## Technical details

### Why not `bd doctor` / `bd preflight` (revision, 2026-08-07)

Empirically verified against this repo:

- `bd info` reports this repo's database mode as `direct` (embedded Dolt, not a Dolt server).
- `bd doctor` — bare, and every `--check=<name>` variant tried (`conventions`, `pollution`, `validate`) — immediately prints `'bd doctor' is not yet supported in embedded mode` and exits without running any check. This is a blanket mode gate, not a per-check limitation.
- `bd preflight --check` runs a fixed checklist (`go test -tags gms_pure_go -short ./...`, `golangci-lint run`, `gofmt -l .`, a `cmd/bd/version.go` vs `default.nix` version comparison) that is specific to `bd`'s own Go codebase, not the calling repo. In canopy (Bun/TypeScript, no Go toolchain, no `cmd/bd/version.go`), these checks fail for reasons unrelated to beads conventions and would be permanently red in CI.
- `bd lint` and `bd query "<expr>"` were verified to run successfully against this repo's `direct`-mode database (e.g. `bd lint` correctly flags issues missing `## Acceptance Criteria`; `bd query "label=none AND status!=closed"` correctly lists unlabeled open issues).

### Why not `push` trigger / `paths-ignore` (revision 2, 2026-08-07, after independent adversarial review)

The audit re-evaluates the entire open-issue backlog every run — it isn't scoped to what changed in a given push, so a `push`-to-`main` trigger recomputes an answer that's already covered by the weekly cron, adding CI cost with no new signal. `paths-ignore` on markdown/docs was also a no-op here: bd's data lives in Dolt (`.beads/`), not tracked markdown files, so that filter wouldn't have bounded anything meaningful anyway. Dropped both; kept `schedule` + `workflow_dispatch`.

### Why the orphan query is informational-only, not a failure trigger (revision 2, 2026-08-07)

`bd query "parent=none AND type!=epic AND status!=closed"` returns zero matches against this repo today, and this repo's own history shows legitimately, intentionally parentless non-epic issues being filed as standalone follow-ons (e.g. `canopy-6cz`, `canopy-2qu`, `canopy-9g1`, per project memory). Treating "no parent" as a failure would either produce near-permanent silence (low value) or push people to invent a parent just to quiet the check (graph pollution, actively worse than the status quo). It's reported as a count/list in the audit output for visibility, but never causes the run to "fail" or blocks report-issue creation.

### Workflow configuration

- Workflow path: `.github/workflows/beads-validation.yml`
- Triggers:
  - `schedule`: cron `0 12 * * 3` (every Wednesday at 12:00 UTC)
  - `workflow_dispatch` for manual triggering
- `concurrency: group: beads-validation`, `cancel-in-progress: false` — serializes overlapping runs (e.g. a manual dispatch during the scheduled window) so the check-existing-issue-then-create/update sequence can't race into duplicate report issues.

### Execution steps

1. Checkout repository with full git history.
2. Setup Bun and install `bd` via `jdx/mise-action` (this repo's `bd` is a mise-managed tool, same as local dev; the step must resolve `bd` on `PATH` before any `bd` command runs).
3. Run `bd lint --json` (default scope: open issues only — see the resource-overhead mitigation below for why `--status all` is explicitly not used here). Parse the returned object's `.results` array; normalize each entry to `{check: "lint", id, title, detail}`.
4. Run `bd query "label=none AND status!=closed" --json`. Parse the returned array (each item is a full issue object); normalize each entry to `{check: "missing-label", id, title}` — drop all other fields, in particular `description`, before it reaches the report.
5. Run `bd query "parent=none AND type!=epic AND status!=closed" --json` (informational only). Normalize the same way, tagged `{check: "orphan-informational", id, title}`.
6. Determine failure using each check's _parsed array/list length_, not raw string truthiness (an empty `bd query` result is the 2-character string `"[]"`, which is non-empty as text but must be treated as zero findings). The run fails if step 3's or step 4's normalized list is non-empty; step 5's findings never cause failure, they're appended to the report body under a separate "Informational" heading.
7. If the run failed, check for an open issue titled `[Beads Audit Failure]` via `gh issue list --search "[Beads Audit Failure] in:title state:open"`.
8. If no open issue exists, create one via `gh issue create` whose body lists each normalized finding grouped by `check`, plus the informational orphan section.
9. If an open report issue already exists, update its body with the current findings (via `gh issue edit --body`) rather than creating a duplicate.

## Adversarial review and mitigations

### Resource and performance overhead

- **Risk**: Running `bd lint` and `bd query` calls on a schedule still adds CI runtime and API quota consumption as issue count grows.
- **Mitigation**: Weekly cron only (no push trigger, see above) bounds run frequency regardless of commit velocity.
- **Risk**: `bd lint --status all` would walk the full closed-issue history (148 issues today and growing), an unnecessary and unbounded cost for a routine check.
- **Mitigation**: The routine workflow step uses `bd lint` with no `--status` flag (open issues only, the default), keeping cost bounded by open-issue count, not total history. `--status all` is reserved for an occasional manual audit run, never the scheduled CI step — execution step 3 above states this explicitly to avoid the ambiguity an earlier draft of this design had.

### Failure modes and edge cases

- **Risk**: `bd lint --json` and `bd query --json` have different, incompatible output shapes (`bd lint --json` is an object with a `.results` array; `bd query --json` is a bare array of full issue objects including `description`), verified by running both against this repo. Naively concatenating or string-checking these outputs would either error on shape mismatch or leak full issue descriptions into the report body.
- **Mitigation**: Normalize each check's output to a common `{check, id, title, detail?}` shape immediately after parsing (execution steps 3-5), before any aggregation or reporting logic touches it.
- **Risk**: Checking "did this check find anything" via raw string non-emptiness misfires — `bd query`'s empty-result JSON (`[]`) is a non-empty string, so a naive `if [ -n "$output" ]` style check would report failure on every run even with zero findings.
- **Mitigation**: Failure detection parses each command's JSON output first and checks the resulting array/list length, never the raw string (execution step 6).
- **Risk**: `bd query "parent=none AND type!=epic AND status!=closed"` is an approximation of "orphan" — it only catches "no parent," not issues that are otherwise disconnected from the graph (no dependency edges, never referenced), and this repo has real, intentional parentless issues.
- **Mitigation**: Demoted to informational-only (see above) rather than a failure trigger, so approximation error costs visibility noise, not false CI failures or graph-pollution incentives.
- **Risk**: Duplicate GitHub issues could flood the repository if scheduled runs fail repeatedly every week, or if a manual `workflow_dispatch` overlaps a scheduled run.
- **Mitigation**: Search existing open issues by title tag `[Beads Audit Failure]` before invoking `gh issue create`, update that issue's body on repeat failures instead of creating a new one each time, and serialize runs via the workflow's `concurrency` group so the search-then-create/update sequence can't race.
- **Risk**: `bd lint`'s per-type section requirements (e.g. `epic` requires "Success Criteria", not "Acceptance Criteria") could be miscategorized if the aggregation step treats all lint output as one homogeneous "missing acceptance criteria" bucket in the report.
- **Mitigation**: The normalized `{check: "lint", ..., detail}` shape carries through `bd lint`'s own per-issue, per-section message as `detail`, rather than collapsing it into a single generic label.
- **Risk**: `bd` must be resolvable on the runner for every step to work at all; if the mise setup step is missing or misconfigured, every subsequent step fails opaquely.
- **Mitigation**: Execution step 2 explicitly names `bd` installation via `jdx/mise-action` as a required step, not assumed implicit from the Bun setup.

### Security and isolation

- **Risk**: GitHub token default permissions may be insufficient to create issues or read repository state.
- **Mitigation**: Declare explicit workflow permissions `issues: write` and `contents: read` in the workflow YAML definition.

### Migration and backward compatibility

- **Risk**: Historical issues without full metadata would fail CI checks immediately, blocking ongoing PR merges if hooked directly into blocking status checks. Running `bd lint`/the label-query check against the current backlog would immediately surface a real, pre-existing set of violations (verified: multiple issues today are missing `## Acceptance Criteria`, e.g. `canopy-f9t`, `canopy-a1s`, several `canopy-1q5.*` children).
- **Mitigation**: Run the beads validation workflow as an advisory non-blocking job initially (it's schedule/dispatch-triggered, not a required PR status check), allowing team members to groom legacy issues without blocking critical CI pipelines. The first report issue is expected to list a real, non-trivial backlog — that's accurate signal, not a false positive, and grooming it is a separate follow-up task, not a prerequisite for landing this workflow.
- **Note**: Report issues filed by this workflow live in GitHub Issues, a tracker separate from the bd/Dolt issue graph itself. That's a deliberate choice (CI alerting needs a channel independent of the system being audited, so a corrupted or unreachable bd database doesn't also take out its own alerting), not an accidental parallel system.
