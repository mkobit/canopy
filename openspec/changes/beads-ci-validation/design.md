# Design: Beads CI validation and automated reporting

## Architecture
The beads validation workflow runs inside GitHub Actions as a standalone job.
It executes `bd` commands (`bd doctor --check=conventions`, `bd preflight`) using Bun and installed repository tooling.
If checks fail, the workflow queries existing GitHub issues using `gh issue list` to prevent duplicate error reports before creating a report issue.

## Technical details

### Workflow configuration
- Workflow path: `.github/workflows/beads-validation.yml`
- Triggers:
  - `push` to `main`
  - `schedule`: cron `0 12 * * 3` (every Wednesday at 12:00 UTC)
  - `workflow_dispatch` for manual triggering

### Execution steps
1. Checkout repository with full git history.
2. Setup Bun environment via `jdx/mise-action`.
3. Run `bd doctor --check=conventions`.
4. Run `bd preflight`.
5. If validation fails, check for open issue titled `[Beads Audit Failure]` via `gh issue list --search "[Beads Audit Failure] in:title state:open"`.
6. If no open issue exists, create one via `gh issue create` containing the detailed failure log.

## Adversarial review and mitigations

### Resource and performance overhead
- **Risk**: Running `bd doctor` on every push adds unnecessary CI runtime and API quota consumption.
- **Mitigation**: Filter push triggers with `paths-ignore` for documentation and markdown files, and restrict scheduled runs to once weekly on Wednesday.

### Failure modes and edge cases
- **Risk**: Duplicate GitHub issues could flood the repository if scheduled runs fail repeatedly every week.
- **Mitigation**: Search existing open issues by title tag `[Beads Audit Failure]` before invoking `gh issue create`, ensuring at most one active report issue exists at a time.

### Security and isolation
- **Risk**: GitHub token default permissions may be insufficient to create issues or read repository state.
- **Mitigation**: Declare explicit workflow permissions `issues: write` and `contents: read` in the workflow YAML definition.

### Migration and backward compatibility
- **Risk**: Historical issues without full metadata would fail CI checks immediately, blocking ongoing PR merges if hooked directly into blocking status checks.
- **Mitigation**: Run the beads validation workflow as an advisory non-blocking job initially, allowing team members to groom legacy issues without blocking critical CI pipelines.
