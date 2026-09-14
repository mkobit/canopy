## Why

The WASM plugin host shares a package and public barrel with GraphQL, Connect, and Unix-socket IPC adapters.
Browser renderers import that barrel to execute plugins, while host bindings call query, mutation, and event operations from the same package.
A directory move alone preserves this coupling.
The package review identified this as [finding F3](../../../docs/research/2026-08-15-package-graph-bounded-contexts-review.md), tracked by `canopy-jxw.2`.

## What changes

- Extract `@canopy/plugin-host` for WASM bindings, capabilities, execution limits, and termination helpers
- Extract `@canopy/graph-access` for the existing shared graph operation handlers, context, payloads, and protocol-independent errors
- Keep protocol-specific schemas, error mappings, and servers in `@canopy/api-adapter`
- Move browser consumers to the two extracted packages and remove their dependency on `@canopy/api-adapter`
- Preserve existing wire contracts, graph mutation semantics, and plugin isolation behavior
- Define the ownership and migration requirements for the later capability-vocabulary design, `canopy-3xr`

This proposal changes internal package imports, including removal of moved exports from `@canopy/api-adapter`.
It does not introduce a new public protocol or change persisted graph data.

## Capabilities

### New capabilities

- `plugin-host-boundary`: independent plugin execution and shared graph access without transport dependencies

### Modified capabilities

None.
Existing protocol and rendering requirements continue to apply; this proposal changes their implementation ownership.

## Impact

Affected areas are `packages/api-adapter`, two new packages, browser renderers and workers, protocol consumers of moved exports, workspace build configuration, schema compatibility checks, and the canonical bounded-context map.
The design includes an adversarial review and a proposed delivery sequence.
Implementation tasks and child beads remain gated on design approval; they are not part of this proposal PR.
