## Why

The current `apps/cli` command structure contains low-level debugging commands (such as a standalone `handshake` command) and lacks top-level subcommands for core Canopy domain entities defined in `docs/design/2025-01-21-canopy-design-v0.1.md` and `@canopy/graph` (such as `types`, `query`, `events`, `status`, and `settings`).

Creating a domain-aligned, scalable CLI architecture ensures the CLI serves as a product client for Canopy's graph engine, schema system, query layer, event log, and daemon status, rather than an ad-hoc developer utility script.

## What changes

- Reorganize `apps/cli` command hierarchy to match Canopy core domain entities:
  - `canopy node`: Graph node operations (`get`, `list`, `create`, `update`, `delete`).
  - `canopy edge`: Graph edge operations (`get`, `list`, `create`, `delete`).
  - `canopy types`: Schema and type definition operations (`list`, `get`).
  - `canopy query`: Execute graph DSL queries (`execute`).
  - `canopy events`: Event log operations (`tail` to stream live events).
  - `canopy status` (and `canopy daemon status` alias): Inspect IPC socket connectivity, API version, server version, capabilities, and active session status.
- Remove standalone `canopy handshake` command; fold protocol capability handshake into `canopy status` (and `canopy status --json`).
- Ensure consistent output formatting (`--json` flag for machine-readable JSON, colored formatted output for human interaction).

## Capabilities

### New capabilities

- `cli-command-architecture`: Comprehensive domain-aligned CLI command architecture for `apps/cli` supporting node, edge, types, query, events, and status operations over IPC socket transport.

### Modified capabilities

(none)

## Impact

- `apps/cli`: Restructure command modules under `src/commands/` (`node.ts`, `edge.ts`, `types.ts`, `query.ts`, `events.ts`, `status.ts`).
- `@canopy/api-adapter`: Consumed via existing IPC handlers (`canopy.v1.handshake`, `canopy.v1.query.*`, `canopy.v1.mutation.*`, `canopy.v1.eventStream.*`).
