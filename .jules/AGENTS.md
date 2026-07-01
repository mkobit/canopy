# Jules

Jules is a scheduled autonomous agent for maintenance tasks.

## How Jules sessions work

Recurring maintenance sessions are triggered manually on a schedule by the maintainer typing a prompt in the Jules UI, instructing Jules to read a specific file from `.jules/prompts/` and execute it.
One-off sessions (e.g. a single mechanical fix) can also be dispatched programmatically via the `jules` CLI (`jules session create --prompt ... --source mkobit/canopy`) from a Claude Code session — these pass their task inline via `--prompt` rather than through a `.jules/prompts/` file.
Either way, Jules must not take actions outside the scope defined in its prompt for the session.

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
