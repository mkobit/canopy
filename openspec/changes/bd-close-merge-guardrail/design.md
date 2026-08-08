# Design: bd close merge guardrail

## Context

`bd` (beads) is a third-party binary installed via `mise` (`~/.local/share/mise/installs/github-gastownhall-beads/`); this repo doesn't own its source, so there is no way to hook `bd close` itself before it commits a status change.
`bd hooks` only wraps git lifecycle events (pre-commit, post-merge, pre-push, post-checkout, prepare-commit-msg) — none of which fire at the moment a bd issue transitions to `closed`, and none of which would catch the incident that motivated this: a branch (`storybook-setup`) was pushed to origin but never turned into a PR, so `git push` succeeded long before the drift was visible.
`bd gate` exists but is scoped to formula/molecule workflow steps, not ad hoc close-time checks on arbitrary issues — not a fit here.
Blocking `bd close` synchronously is also the wrong shape for the common case: closing an issue and then opening a PR is the normal, correct sequence, so a check that blocks close on "not yet on `origin/main`" would be a false positive on every issue, every time.
The actually-useful signal is a closed issue that is _still_ unreachable from `origin/main` after enough time has passed that it should have landed.

A related, not-yet-implemented change (`beads-ci-validation`, canopy-qvn.5) already proposes a scheduled GitHub Actions workflow (`.github/workflows/beads-validation.yml`) that runs `bd doctor`/`bd preflight` and files a single tracking issue on failure via `gh issue create`/`gh issue list`. This design reuses that scheduling and reporting shape instead of standing up a second one.

## Goals / Non-Goals

**Goals:**

- Make "closed bd issue, no reachable commit on `origin/main`" detectable automatically, on a schedule, without manual git archaeology.
- Give developers/agents a fast local check they can run around `bd close` for immediate feedback, even though it can't be a true blocking hook.
- Reuse existing CI scheduling/reporting infrastructure (from `beads-ci-validation`) rather than duplicating it.

**Non-Goals:**

- Synchronously blocking `bd close` itself — not possible without modifying or wrapping the third-party `bd` binary, and wrong for the common close-then-PR workflow anyway.
- Replacing or modifying `bd doctor --check=conventions` — that check is advisory and orthogonal (issue metadata quality, not git reachability).
- Enforcing this for non-code-bearing issue types (`epic`, `decision`, `story`, `milestone`) — those don't correspond to a single mergeable commit.
- Detecting commits that landed and were later reverted — a reverted commit still contains the issue ID and reads as "reachable," so a closed issue whose work was reverted will not be flagged. Documented limitation, not solved here.
- Backfilling or auditing the existing closed-issue backlog — this check is forward-looking from a cutoff timestamp (see Migration below); historical drift (including the incident that motivated this change) requires a separate one-time manual audit, not this tool.

## Decisions

### Reachability signal: commit message contains the issue ID, boundary-anchored

Detect "implemented" by searching full `git log origin/main` messages — subject and body, not just the subject line — for the issue's ID, anchored so `canopy-qvn` does not match inside `canopy-qvn.5`, `canopy-c54` does not match inside `canopy-c54.1`, and `.7` does not match inside `.70` (require the character after the ID to not be `.` followed by a digit, or alphanumeric).
**Alternative considered**: a structured `Bd-Issue: <id>` trailer. Rejected for now — it would require rewriting agent/commit conventions repo-wide; the free-text ID match is what's already in use.
**Verified risk, not fully solvable by matching alone**: an audit of recent merge history (`git log --oneline -30`) shows every PR here is squash-merged to one human-authored title, and a meaningful share of commits carry no bd ID at all (dependency bumps, some `feat:`/`refactor:` commits). Squashing also collapses N children's worth of work into a title that typically names only 1–2 IDs — exactly the shape of the incident that motivated this change, had it been squash-merged instead of left unmerged. This means false positives (ID-bearing work with no ID in the final message) are a normal occurrence, not a rare edge case, and the exemption/triage path below has to carry real volume, not just outliers. Before enabling CI enforcement, measure actual ID-coverage over the last N months of `origin/main` history so the expected false-positive rate is known going in rather than discovered as report noise.

### Grace period, not immediate flagging

Default 48 hours between `bd close` and being eligible for flagging.
**Alternative considered**: flag immediately. Rejected — would fire on essentially every issue, since close-before-PR-merge is the normal sequence, making the signal useless (the exact false-positive-flood failure mode called out in `beads-ci-validation`'s own design for a related check).

### Delivery: one script, two callers (CI + local)

A single script (`tools/beads/check-merged-issues.ts`, Bun) contains the reachability/grace-period logic. CI invokes it as an added step in `beads-ci-validation`'s workflow; a `package.json` script (`bd:check-merged`) invokes it locally for a single issue ID or the issue IDs referenced in unpushed/recent commits.
**Alternative considered**: separate CI-only implementation and local-only implementation. Rejected — would duplicate the reachability logic and let the two drift from each other, contradicting the "small APIs, single source of truth" preference already established for this codebase's own automation scripts.

### Scope: code-bearing types only, with an exemption escape hatch

Default code-bearing types: `task`, `bug`, `feature`, `chore`. Excluded by default: `epic`, `decision`, `story`, `milestone`, `spike`.
`spike` defaults to excluded, not included: this repo's own convention (and this design's own admission above) is that spikes typically produce a doc or finding, not a mergeable commit — defaulting it to code-bearing would mean remembering an exemption on nearly every spike, an inverted default. A spike that _does_ land code can opt in with a `code-bearing` label, the inverse of the exemption below.
A `no-code` label on an individual issue exempts it from an otherwise-code-bearing type (e.g. a `feature` issue that turned out to be an umbrella for child issues that carried the actual commits — this repo uses `feature` for some epic-like umbrella work, not only leaf work).
A `no-code` label on an individual issue exempts it (e.g. a decision record closed without a corresponding commit).
**Alternative considered**: check every closed issue regardless of type. Rejected — epics and decisions routinely close without their own commit (their children carry the code), which would make the check permanently noisy and easy to ignore.

## Ordering with beads-ci-validation (canopy-qvn.5)

This change's CI step depends on `.github/workflows/beads-validation.yml` existing, and the check needs full git history (see shallow-clone risk below), which only the `beads-ci-validation` workflow's checkout step is currently specified to provide. To avoid two changes racing to create/own the same new workflow file, `beads-ci-validation` (canopy-qvn.5) is a hard prerequisite: this change's tasks add a step to the already-existing workflow, not create it. If `beads-ci-validation` hasn't landed when this change is picked up, its tasks land first.

## Adversarial review and mitigations

### Resource and performance overhead

- **Risk**: Walking full `git log origin/main` history and cross-referencing every closed bd issue on every CI run scales linearly with both repo history and bd database size, and could get slow as either grows.
- **Mitigation**: Scope the `git log` search to commits since the oldest still-open-for-checking closed issue's close timestamp (bd tracks `closed_at`), not full history; reuse the same weekly-schedule cadence as `beads-ci-validation` rather than running on every push.

### Failure modes and edge cases

- **Risk**: Naive substring matching on issue IDs produces false negatives — `canopy-qvn` matches inside `canopy-qvn.5`, `canopy-c54` matches inside every `canopy-c54.N` child, `.7` matches inside `.70`. A parent/short-ID issue would read as "reachable" purely because an unrelated child's commit happens to contain its ID as a substring, silently defeating the check.
- **Mitigation**: ID matching is boundary-anchored (see Decisions above) — the match must not be immediately followed by `.` + digit or by another alphanumeric character.
- **Risk**: An issue is closed and its work legitimately lands via squash-merge with a commit message that doesn't include the issue ID. Verified against this repo's actual history: squash-merge-to-human-title is the norm, a meaningful share of commits carry no ID at all, and a squash collapses N child commits into a title naming only 1-2 IDs — the exact shape of the incident that motivated this change. This makes false positives routine, not rare.
- **Mitigation**: Search full commit message (subject + body), not just the subject line, since bodies more often retain full ID lists; the `no-code` exemption label and per-issue `bd note` triage (via the tracking issue) handle individual cases; measure actual historical ID-coverage before enabling CI enforcement so the expected false-positive volume is known upfront rather than discovered as report noise.
- **Risk**: A commit lands and is later reverted; the issue ID stays in reachable history either way (original commit + revert commit both mention it), so a closed issue whose work was actually reverted still reads as "clean."
- **Mitigation**: Out of scope for this check (see Non-Goals) — reachability answers "did commits referencing this ID land," not "is the feature currently present on main." Revert detection would need semantic diff tracking, a different and heavier tool.
- **Risk**: An issue is closed, reopened, and reclosed — the grace-period clock should reset, not use the original close time.
- **Mitigation**: Use bd's per-issue close event history if the CLI surface supports it (verify `bd history <id>` exposes discrete close events at implementation time); if it only exposes a single `closed_at` field, that's sufficient on its own since bd overwrites it on reclose — don't build reopen-tracking machinery beyond what `closed_at` already gives for free.
- **Risk**: Local check gives a false "clean" result if run against a stale local clone where `origin/main` hasn't been fetched recently.
- **Mitigation**: The local script runs `git fetch origin main` (lightweight, single-ref) before checking reachability, same as CI's checkout guarantees freshness.
- **Risk**: `actions/checkout` defaults to `fetch-depth: 1`. A shallow clone makes nearly every closed issue's commits "unreachable" in `git log`, producing mass false positives on the very first CI run.
- **Mitigation**: The CI step requires (and, since it depends on `beads-ci-validation`'s checkout per Ordering above, must confirm) `fetch-depth: 0` on the shared checkout step.
- **Risk**: Weekly cadence plus a 48h grace period means up to ~9 days of latency between drift occurring and being reported, and a tracking issue left open after drift self-resolves (e.g. the PR merges the day after the report fires) can go stale if nobody manually closes it.
- **Mitigation**: Pin cadence explicitly to the same weekly schedule as `beads-ci-validation` (not a separate configurable cadence) to avoid two independent schedules drifting apart; each run re-evaluates and updates the tracking issue's body with the current drifted-ID list (clearing resolved ones), so a stale-but-open issue at least reflects current state rather than a stale snapshot.

### Security and isolation

- **Risk**: The local check and CI step both shell out to `git` and `bd`; if the script did anything with issue content (e.g. titles) unsanitized in a shell command, it would be an injection risk.
- **Mitigation**: Use `bun`'s `Bun.spawn`/argv-array invocation (no shell string interpolation) for all `git`/`bd`/`gh` calls, consistent with existing scripts in `tools/`; the CI step reuses `beads-ci-validation`'s already-scoped `issues: write` / `contents: read` permissions rather than requesting new ones.

### Migration and backward compatibility

- **Risk**: Running this against the existing bd database immediately after landing would likely flag a backlog of legitimately-already-merged-but-untrelated-in-commit-message historical issues, creating a noisy first report.
- **Mitigation**: First CI run is scoped to issues closed after the change lands (skip pre-existing closed issues by default, via a cutoff timestamp config value), so the report starts clean and only catches new drift going forward; a one-time manual audit of historical closed issues (separate task, not blocking this change) can backfill `no-code` labels or commit notes if wanted later.
