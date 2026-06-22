## Why

The toolchain (OpenSpec, Beads, Jules, Claude Code, Gemini CLI) is installed but has no defined protocol for how work flows between layers — there is no convention for seeding Beads from OpenSpec, no label taxonomy that lets agents self-route to the right tasks, and no explicit boundary between planning work (user-facing) and execution work (agent-facing).
Without this protocol the toolchain is a collection of unconnected tools rather than a coordinated system.

## What changes

- Define the three-layer coordination model: planning (OpenSpec + user), execution (Beads + agents), review (user)
- Define a label taxonomy that agents use to self-select tasks by complexity and type
- Define the seeding handoff: how a completed OpenSpec `tasks.md` becomes a Beads issue graph
- Define a `mol-openspec-change` formula template that encodes the standard seeding pattern
- Define the Jules prompt pattern for autonomous task discovery and claim via `bd ready`
- Document user touchpoints: planning entry (OpenSpec) and exit (PR review) — everything between is agent-owned

## Capabilities

### New capabilities

- `task-label-taxonomy`: Label conventions (`complexity:low/medium/high`, `mechanical`, `needs-design`, `agent:jules`) that agents and formulas use to classify and route tasks
- `openspec-to-beads-seeding`: The handoff protocol — how a completed `tasks.md` is converted to a Beads issue graph via `bd create --graph` and the `mol-openspec-change` formula
- `agent-task-routing`: How each agent class (Jules, local interactive agents) discovers and claims work from Beads using `bd ready` with label filters
- `jules-prompt-pattern`: The stored-prompt convention in `.jules/prompts/` that drives autonomous Jules sessions for both Beads-driven tasks and direct OpenSpec/code tasks

### Modified capabilities

<!-- None — no existing specs -->

## Impact

- `.beads/formulas/` — new formula file(s)
- `.jules/prompts/` — updated or new prompt files encoding the task-discovery pattern
- `openspec/` — this protocol becomes the reference for all future change seeding
- No application code changes
