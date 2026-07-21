## Why

Currently, resolving settings via `resolveSetting` and view definitions via `resolveViewDefinition` requires traversing the entire graph (`graph.nodes.values()`) to locate `SettingsSchema`, `UserSetting`, and `ViewDefinition` nodes.
As the graph grows, this linear scan results in O(N) search time for every resolution check.
This causes performance degradation in hot rendering paths such as React block rendering where view definitions and settings are resolved repeatedly.

## What Changes

- Pre-index and cache `SettingsSchema` nodes by key.
- Pre-index and cache `UserSetting` nodes by schemaId, scopeType, and scopeTarget.
- Pre-index and cache `ViewDefinition` nodes and their associated view override/default view edges.
- Update `packages/settings` to use these pre-indexed structures for setting and view resolution rather than performing full graph scans.

## Capabilities

### New Capabilities

- `view-settings-indexing`: Cache and pre-index view definitions and settings schemas for fast resolution.

### Modified Capabilities

<!-- None -->

## Impact

- `@canopy/graph`: Define optional index/cache data structures.
- `@canopy/settings`: Update resolution functions to leverage the indexes when available.
