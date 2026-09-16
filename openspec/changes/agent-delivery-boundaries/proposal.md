## Why

Canopy's [product suite](../../../docs/architecture/core-tenets.md) needs independently refinable domain contexts and bounded implementation assignments.
Agents should execute explicit decisions without having to rediscover the architecture or resolve product ambiguity themselves.
The current package map, OpenSpec designs, Beads, and agent guidance provide the pieces, but do not define one reviewable delivery contract between planning and execution.
This continues the documentation and workflow work tracked by `canopy-egu`, with domain boundaries tracked by `canopy-ax6`.

## What changes

- Define a context contract and a bounded slice handoff, including ownership, scenario evidence, dependencies, and escalation conditions
- Separate design exploration, approved implementation, independent review, and root integration
- Define how a context can evolve without unrelated agents silently implementing different contracts
- Demonstrate the protocol on graph-defined rendering, approval staging, and concurrent-device history
- Specify a small documentation-first pilot using existing OpenSpec and Beads tooling

This proposal is groundwork only.
It creates no implementation tasks, dispatches no implementation agents, and grants no merge authority.

## Capabilities

### New capabilities

- `bounded-agent-delivery`: contract-based preparation, execution handoffs, and acceptance of agent work

### Modified capabilities

None.
Application behavior and existing domain contracts remain unchanged.

## Impact

After approval, the protocol informs OpenSpec design/task guidance, Beads descriptions, and root/Jules agent instructions.
Generated skills should inherit project context through the supported tooling workflow rather than independent edits to each generated copy.
The [current package map](../../../docs/architecture/bounded-contexts.md) remains authoritative; this change does not add packages or duplicate its dependency graph.
No new scheduler, orchestration service, model-specific routing system, or runtime dependency is proposed.
