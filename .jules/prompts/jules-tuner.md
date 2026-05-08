# Jules prompt tuner and scheduler proposal

Goal: review the quality of existing Jules prompt files and identify whether any new recurring schedulers are warranted.
Scope: read and write prompt files in `.jules/prompts/` only. Do not modify source code, beads issues, or openspec changes.

## Steps

1. List all files in `.jules/prompts/` and read each one.

2. For each existing prompt, verify the commands it references still exist and have the correct flags:
   - Run `bd --help` to check bd subcommands.
   - Run `bunx openspec --help` to check openspec subcommands.
   - If a command or flag has changed, update the prompt file directly.

3. For each prompt, evaluate quality against these criteria:
   - Goal is stated in one sentence.
   - Scope section explicitly forbids out-of-bounds actions.
   - Steps reference exact commands with flags, not vague instructions.
   - "One session only" constraint is present.
   If a prompt fails a criterion, improve it in place.

4. Review the full set of prompts and identify any maintenance concern that recurs but has no prompt:
   - Examples: orphaned bd issues, openspec changes with no linked bd issues, issues stuck in `in_progress` for too long.
   - For each gap found, create a new prompt file in `.jules/prompts/<name>.md` following the same format as the existing prompts.
   - Keep each new prompt narrowly scoped to one concern.

5. Write a brief summary to `.jules/tuner-report.md`:
   - Prompts modified and what changed.
   - New prompts created and why.
   - Any concerns that were identified but not addressed (too complex for a single scheduler).

## Constraints

- Only write to `.jules/prompts/` and `.jules/tuner-report.md`.
- Do not create beads issues or openspec changes.
- Do not run `bd dolt push`.
- One session only.
