## Why

Canopy operates across personal knowledge management, remote agent memory, and graph database storage.
Past development coupled distribution with runtime authority.
Components bundled with the application binary or authored by core maintainers sometimes assumed ambient kernel privilege or native execution.
When a user disables or removes a plugin, missing type definitions and renderers can cause queries to fail or cause views to show blank errors.
This proposal establishes explicit boundaries between kernel primitives, system host services, first-party plugins, and third-party extensions.
This change resolves the design requirements for [`canopy-ax6`](https://github.com/mkobit/canopy).

## What changes

- Define four orthogonal dimensions of extensibility: maintainer provenance, distribution mechanism, runtime isolation boundary, and granted authority.
- Enforce the invariant that maintainer identity and distribution channel do not grant runtime privilege or ambient capabilities.
- Classify system components into four tiers:
  - Tier 0: Graph kernel primitives (`@canopy/graph`).
  - Tier 1: System host services (`@canopy/plugin-host`, `@canopy/graph-access`, `@canopy/queries`, `@canopy/settings`).
  - Tier 2: First-party extensions (standard renderers, views, and lifecycle automations).
  - Tier 3: Third-party ecosystem extensions.
- Require durable schema retention where `NodeTypeDefinition` and `EdgeTypeDefinition` entities persist in the graph independently of plugin binary state.
- Require view resolution fallback cascades that default to a generic property table when a dedicated renderer is absent or fails.
- Mandate explicit, non-wildcard tokens for sensitive capabilities such as interactive rendering and network egress.

## Capabilities

### New capabilities

- `plugin-and-extension-boundaries`: architectural boundaries, tier classifications, durable schema retention rules, and view fallback behaviors across Canopy components

### Modified capabilities

None.

## Impact

This proposal defines architectural boundaries and design invariants across `@canopy/graph`, `@canopy/plugin-host`, `@canopy/graph-access`, and user interfaces.
It changes no wire protocols and does not modify the persisted binary format of the event log.
Implementation tasks and beads remain gated until this design passes adversarial review and achieves maintainer approval.
