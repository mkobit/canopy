## Context

The project has three agentic tools installed and bootstrapped:
- **OpenSpec** — spec-driven planning: explore → propose → design → tasks
- **Beads** — Dolt-backed issue graph with `bd ready` / `bd update --claim` for agent task pickup
- **Jules** — async sandboxed agent that checks out `main` on a schedule, runs stored prompts from `.jules/prompts/`, and opens PRs; no shared Dolt state with local environment

Local interactive agents (Claude Code, Gemini CLI) serve two roles: thinking partner with the user during planning, and autonomous executor when unattended. Jules only ever executes.

Currently none of these tools coordinate — there is no formula for seeding Beads from OpenSpec, no label taxonomy for agent routing, and no Jules prompt pattern for Beads-driven task discovery.

The user's role is constrained to: planning entry (OpenSpec explore/propose) and review exit (PR merge/reject). Everything between is agent-owned.

This is a solo project. Multi-agent coordinator, real-time conflict resolution, and cross-project federation are explicitly out of scope.

## Goals / Non-Goals

**Goals:**

- Define the three-layer model and document it as the canonical reference
- Establish a label taxonomy that is stamped at seeding time and used by `bd ready` filters
- Define the `mol-openspec-change` formula structure for seeding a change's tasks into Beads
- Define the Jules prompt pattern for autonomous task pickup from Beads
- Make the seeding step explicit: user signs off on tasks.md, then triggers seeding — that is the handoff

**Non-Goals:**

- Real-time sync between Jules's Dolt state and local Dolt state — Jules is fully separate
- GitHub issue federation — all coordination is local via Beads and OpenSpec files on main
- Multi-agent coordinator or conflict resolution beyond merge-conflict-as-signal
- Any application feature work

## Decisions

### Three-layer model

```
Layer 1 — Planning (user + interactive agents)
  OpenSpec: explore → propose → specs/design/tasks.md
  Output: a completed tasks.md the user has reviewed

Layer 2 — Execution (any agent, autonomous)
  Seeding: tasks.md → bd create --graph → Beads issue graph
  Claim:   bd ready [filter] → bd update --claim → implement → PR
  Output:  a PR the user can review

Layer 3 — Review (user)
  Merge or reject the PR
  Closed Beads issues follow automatically
```

The seeding step is the explicit handoff boundary. The user triggers it after reviewing tasks.md. Agents do not seed — they only claim pre-seeded work.

### Label taxonomy

Labels are stamped at seeding time by the formula or the seeding script. Agents filter on these labels via `bd query` or `bd ready`.

**Complexity:**
- `complexity:low` — mechanical, no ambiguity, Jules-appropriate
- `complexity:medium` — requires judgment, local interactive agent
- `complexity:high` — requires planning session before starting; local agent + user

**Nature:**
- `mechanical` — pure execution, no design decisions (dependency bumps, config changes, file renames)
- `needs-design` — task is blocked until an OpenSpec design doc exists; not claimable until cleared

**Agent hint (priority signal, not hard assignment):**
- `agent:jules` — ranked P3/P4; local agents skip past these naturally; Jules targets them specifically
- No label = default P2, local agents pick up first

**Considered:** using `--skills` field on Beads issues.
**Rejected:** skills implies capability gating; we want suggestion routing, not access control. Labels on `bd ready` filters are sufficient and more transparent.

### mol-openspec-change formula

A formula file at `.beads/formulas/mol-openspec-change.formula.yaml` encodes the standard pattern for seeding a change. It takes `change_name` as a variable and produces a DAG that mirrors the tasks.md group structure. Steps inherit labels derived from task content heuristics (presence of "bump", "update deps", "rename" → `mechanical` + `complexity:low` + `agent:jules`).

For the initial implementation, the formula is intentionally simple — a flat group-per-section structure. Bonding and gate chaining can be added later as patterns emerge from real usage.

**Considered:** a script that parses tasks.md and calls `bd create --graph` directly.
**Rejected:** a formula is reusable across changes; a script would need to be maintained separately and has no schema. The formula approach keeps the seeding pattern versioned alongside the project.

### Jules prompt pattern

Jules prompts in `.jules/prompts/` follow a two-phase structure:
1. **Discovery**: `bd ready --filter agent:jules` to find claimable tasks; if none, exit gracefully
2. **Execution**: claim one task (`bd update --claim`), implement, open PR

Jules never claims more than one task per session. This keeps PRs small and reviewable.

For non-Beads prompts (OpenSpec housekeeping, dependency updates), the prompt encodes the full task directly — no Beads lookup needed. The distinction is explicit in the prompt filename convention:
- `beads-*.md` — prompts that use `bd ready` for discovery
- Direct task prompts keep their existing names (backlog-pruner, issue-enricher, etc.)

### Collision handling

Local agents (Claude, Gemini) share a Dolt database. `bd update --claim` is atomic — Dolt handles concurrent local writes. No additional coordination needed.

Jules checks out main at session start, so its Dolt state is a snapshot. If two Jules sessions (or a Jules session and a local agent) claim the same task before either PR merges, the second PR will have a conflict in `.beads/`. This surfaces the duplication at review time. Acceptable for a solo project at current scale.

## Risks / Trade-offs

- [Risk] Formula heuristics for label inference misclassify tasks → Mitigation: labels can be manually overridden after seeding with `bd label`; heuristics are a convenience, not a hard gate
- [Risk] Jules sessions run against a stale main snapshot and claim already-in-progress tasks → Mitigation: merge-conflict signal is sufficient; duplicate work occasionally acceptable
- [Risk] Formula structure drifts from actual tasks.md format over time → Mitigation: formula is versioned in `.beads/formulas/`; failing `bd mol pour --dry-run` surfaces drift early
