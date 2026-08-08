## 1. Workflow creation and scripting

- [x] 1.1 Create `.github/workflows/beads-validation.yml` with `schedule` + `workflow_dispatch` triggers (no `push` trigger — see design's rationale), full-history checkout (`fetch-depth: 0`, needed by canopy-qvn.7's later CI step), and a `concurrency` group to serialize overlapping runs.
- [x] 1.2 Add `bd` installation step (`jdx/mise-action`) before any `bd` command runs.
- [x] 1.3 Implement step to execute `bd lint --json` (open issues only, no `--status all`) and normalize its `.results` array to `{check: "lint", id, title, detail}`.
- [x] 1.4 Implement step to execute `bd query "label=none AND status!=closed" --json` and normalize the returned issue array to `{check: "missing-label", id, title}`, dropping `description` and other fields.
- [x] 1.5 Implement step to execute `bd query "parent=none AND type!=epic AND status!=closed" --json` and normalize the same way, tagged `{check: "orphan-informational", id, title}`.
- [x] 1.6 Determine failure from the parsed length of the lint and missing-label result lists (not raw string truthiness); the orphan-informational list never contributes to failure.
- [x] 1.7 Implement step to search open issues (`gh issue list --search "[Beads Audit Failure] in:title state:open"`) and create a single `[Beads Audit Failure]` issue on failure — body grouped by check, informational orphan findings in a separate section — or update its body (`gh issue edit --body`) if one already exists.
- [x] 1.8 Declare explicit `issues: write` / `contents: read` workflow permissions.

## 2. Validation and testing

- [x] 2.1 Test workflow execution locally (manual `bd lint`/`bd query` runs, or `act`) and confirm the lint/label checks surface the real, currently-known backlog (e.g. `canopy-f9t`, `canopy-a1s` missing Acceptance Criteria).
- [x] 2.2 Confirm an all-zero-findings run (`[]` from both query checks) is correctly treated as passing, not a false failure.
- [x] 2.3 Verify duplicate issue suppression / update-in-place logic, including under a simulated overlapping-run scenario (concurrency group behavior).
- [x] 2.4 Confirm the workflow runs as advisory (non-blocking, not a required PR status check) initially, per the migration mitigation in design.md.
