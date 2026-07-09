# Deferred — not implemented

This proposal was filed 2026-06-17 and deferred 2026-06-22 without implementation.

## Why deferred

The proposal preempts friction that has not actually materialized:

- bd was made local-only (PR #306, 2026-06-19), so the agent-routing-via-bd-labels piece is moot for Jules. Issue handoff happens via `.jules/prompts/*.md` instead.
- The first real OpenSpec cycle (`functional-guardrails`, PRs #307–#309, completed 2026-06-21) needed zero multi-agent coordination. The friction was tactical (eslint policy, CI ordering), not coordination-shaped.
- Almost all current work is "high-capability thinking" (architecture, design, judgement calls), not mechanically-implementable tickets. A routing protocol has no work to route.

## Trigger to revisit

Reopen this proposal when **both** signals are present:

1. ~10+ open bd tickets at once that are mechanically scoped (clear input, clear output, no design decisions needed inside the ticket).
2. Active interest in routing some of those tickets to remote agents (Jules or other) in parallel, rather than executing them in interactive sessions.

Until both are true, the protocol would drift from reality before it could be useful.

## What's preserved here

- `proposal.md`, `design.md`, `tasks.md`, `specs/` — the original artifacts, untouched.
  Use these as the starting point if/when the proposal is reopened, since they capture the original intent.
- No code or spec changes were applied to `openspec/specs/` or the workspace.
