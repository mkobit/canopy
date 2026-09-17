# Jules

Jules is a scheduled autonomous agent for maintenance tasks.

## Product context

Read [Core tenets](../docs/architecture/core-tenets.md) before interpreting designs or editing issue descriptions.
Canopy targets a product suite sharing a graph domain: PKMS, remote memory, graph knowledge database access, and secure plugins.
Rendering is resolved through graph definitions and supported application or WASM components.
CLI, MCP, and agent features consume the core model.
Preserve the distinction between current contracts, intended capabilities, and unresolved decisions when enriching, pruning, or archiving work.
This context does not expand the session's authorized scope.

## How Jules sessions work

Recurring maintenance sessions are triggered manually on a schedule by the maintainer typing a prompt in the Jules UI, instructing Jules to read a specific file from `.jules/prompts/` and execute it.
One-off sessions (e.g. a single mechanical fix) can also be dispatched programmatically via the `jules` CLI (`jules session create --prompt ... --source mkobit/canopy`) from a Claude Code session — these pass their task inline via `--prompt` rather than through a `.jules/prompts/` file.
Either way, Jules must not take actions outside the scope defined in its prompt for the session.

## Bounded implementation assignments

Read the [repository delivery guidance](../AGENTS.md#bounded-agent-delivery) and use the [handoff template](../openspec/changes/agent-delivery-boundaries/handoff-template.md) for implementation assignments.
The dispatcher manually verifies merged design approval and approved adversarial mitigations before staging tasks or dispatching implementation.
Artifact presence, `bd ready`, structural validation, and generated recommendations do not establish approval or integrated acceptance.
A complete packet pins the base and approved contract revisions, provided and consumed contracts, prerequisites, editable scope, reserved files, isolation, integration owner, independent reviewer, and scenario evidence with verified checks.
Return incomplete packets to preparation rather than infer missing authority or domain semantics.

For remote implementation without authoritative Beads access, the local dispatcher atomically claims the approved task with `bd update <id> --claim` and supplies the complete packet.
Do not claim or update a copied database for implementation ownership; the dispatcher reconciles the result with the authoritative issue after review.
These implementation rules do not remove existing prompt-authorized recurring maintenance operations such as enrichment, pruning, dependency updates, or archival, and those operations do not authorize implementation dispatch.
The packet assigns authority separately for issue updates, commits, pushes, PR creation, merge, and closure, subject to this file's constraints.
The PR flow is a publication route, not blanket permission to publish; return evidence when an action is unassigned.

You are not alone in the codebase; preserve other contributors' edits and stay within the assigned scope.
Stop dependent work and report missing or contradictory contracts to the integration owner; do not invent semantics, weaken checks, or expand permissions.
Return base and commit identity, changed files, scenario evidence, check outcomes, and unresolved concerns for independent review and integration-owner acceptance.
Re-check task instructions and pinned revisions before handoff; material contract or baseline changes require renewed affected checks and independent review.
Worker success alone does not authorize publication, integration, or issue closure.

## Environment setup

Run `.jules/env_setup.sh` at the start of each session to install and verify all tools.
The script installs mise, bun, bd (beads), and all bun dependencies including openspec.
Update `env_setup.sh` manually whenever tooling changes substantially (new mise tools, new bun deps).

## Available prompts

| File                               | Purpose                                                      |
| :--------------------------------- | :----------------------------------------------------------- |
| `prompts/backlog-pruner.md`        | Close stale, vague, or superseded beads issues               |
| `prompts/issue-enricher.md`        | Fill in missing type, priority, and descriptions             |
| `prompts/dependency-linker.md`     | Link related issues and resolve duplicates                   |
| `prompts/openspec-housekeeping.md` | Archive complete openspec changes, validate in-progress ones |
| `prompts/automation-health.md`     | Audit commands, configs, and prompt file validity            |
| `prompts/jules-tuner.md`           | Improve prompt quality and identify scheduling gaps          |

## Constraints that apply to all Jules sessions

- Do not push to git remotes (`git push`) — rely on `--auto-pr` / the PR flow instead.
- Do not run `bd dolt push`. bd has a Dolt remote configured (crash recovery only, since 2026-07-01) — syncing it is the interactive session's job at session close, not a Jules session's.
- Do not modify source code unless the prompt explicitly permits it.
- Do not create beads issues or openspec changes unless the prompt explicitly permits it.
- Stop at the end of the steps defined in the prompt — do not continue into adjacent work.
