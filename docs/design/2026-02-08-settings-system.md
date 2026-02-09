# Settings system

> Status: **draft**
> Scope: settings schemas, user settings, resolution cascade, settings storage
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md), [2026-02-08-event-system.md](2026-02-08-event-system.md)

---

## 1. Principles

Settings are nodes in the graph.
They follow the same data model as everything else: typed nodes, edges, properties, events.

Settings schemas (what settings exist, their types, their defaults) are system nodes.
User settings (overrides of those defaults) are user nodes in a dedicated namespace.

Settings resolution is a cascade from most specific to least specific.
The system queries multiple scopes and returns the first match.

---

## 2. Settings schemas

A **SettingsSchema** is a system node type in the system namespace.
It defines an available setting:

- **key**: unique identifier for the setting (e.g., `default-renderer`, `display-density`).
- **value type**: the expected property value type (string, number, boolean, NodeId, etc.).
- **default value**: the system default if no override exists.
- **description**: human-readable explanation of what the setting controls.
- **scope**: which granularity levels this setting supports (global, per-type, per-node, per-namespace).

Settings schemas are created during bootstrap as part of the system namespace.
New settings are added via migration events when the application upgrades.

Users cannot create settings schemas.
They can only set values for schemas that exist.

> **Open question**: whether extensions or imported vocabularies can define their own settings schemas.
> This is likely needed for custom renderers that have configuration options.

---

## 3. User settings

User settings live in a dedicated **`user-settings` namespace** within the main graph.
They are logically partitioned from content and system nodes but share the same event log and identity space.

A user setting is a node that references a SettingsSchema and provides an override value.
It also carries scope information: which type, node, or namespace this override applies to.

### Setting node properties

| Property       | Type          | Required | Description                                                               |
| -------------- | ------------- | -------- | ------------------------------------------------------------------------- |
| `schema`       | NodeId        | yes      | Reference to the SettingsSchema node                                      |
| `value`        | PropertyValue | yes      | The override value                                                        |
| `scope_type`   | string        | no       | "global", "per-type", "per-node", or "per-namespace"                      |
| `scope_target` | NodeId        | no       | The TypeId, NodeId, or namespace node this applies to (absent for global) |

### Examples

A global setting:

```
{ schema: <default-renderer-schema-id>, value: <markdown-renderer-id>, scope_type: "global" }
```

A per-type setting:

```
{ schema: <default-renderer-schema-id>, value: <code-renderer-id>, scope_type: "per-type", scope_target: <CodeBlock-type-id> }
```

A per-node setting:

```
{ schema: <display-density-schema-id>, value: "compact", scope_type: "per-node", scope_target: <specific-node-id> }
```

---

## 4. Resolution cascade

When the system needs a setting value for a given context, it queries the cascade.

### Resolution order

1. **Per-node**: is there a setting for this specific node?
2. **Per-type**: is there a setting for this node's type?
3. **Per-namespace**: is there a setting for this node's namespace?
4. **Global**: is there a global user override?
5. **System default**: fall back to the default value from the SettingsSchema.

The first scope that provides a value wins.
Resolution stops at the first match.

### Resolution as a query

Settings resolution is a graph query.
The programmatic API provides a convenience method, but it compiles to the same query engine as everything else.

Pseudocode:

```
resolve(schema_key, node) ->
  find setting where schema.key = schema_key AND scope_type = "per-node" AND scope_target = node.id
  OR find setting where schema.key = schema_key AND scope_type = "per-type" AND scope_target = node.type
  OR find setting where schema.key = schema_key AND scope_type = "per-namespace" AND scope_target = effective_namespace(node)
  OR find setting where schema.key = schema_key AND scope_type = "global"
  OR return schema.default_value
```

This is a multi-step query with early termination.
It should be fast for the common case (most settings are global or per-type, so the first two or three steps resolve quickly).

### Per-namespace settings

Per-namespace settings allow overrides for all nodes in a given namespace.
This is useful when importing external vocabularies that should have distinct presentation defaults.

For example, nodes imported from schema.org might use a different renderer than user-created nodes, without setting per-type overrides for every imported type.

Per-namespace is checked after per-type and before global.
A per-type override still takes precedence over a per-namespace override.

> **Note**: the `scope_target` for a per-namespace setting must reference something that identifies the namespace.
> How namespaces are represented (as nodes, as string conventions, or both) is an open question in the [core data model](2026-02-06-core-data-model.md), section 10.

---

## 5. Settings and events

Setting a user preference produces events like any other graph mutation.
A user changing their default renderer emits a `NodeCreated` (if no override existed) or `NodePropertiesUpdated` (if changing an existing override) event.

These events live in the same event log as content events.
They are identifiable by their namespace (`user-settings`) and can be filtered in event history views.

Settings events participate in sync like any other events.
If a user changes a setting on device A, it syncs to device B through normal event replication.

### Settings conflicts

Two devices can change the same setting concurrently.
Resolution follows the same LWW rule as all other property conflicts: later timestamp wins (see [event system](2026-02-08-event-system.md), section 6).

This is acceptable for settings.
Settings changes are infrequent and rarely collide in practice.

---

## 6. System defaults

System defaults are properties on the SettingsSchema nodes themselves.
They are the fallback when no user override exists at any scope level.

System defaults can change across application versions via migration events.
If a new version changes the default renderer, the SettingsSchema node's default value is updated by a migration event.

User overrides are not affected by system default changes.
If a user has explicitly set a renderer, a system default change does not override their choice.

---

## 7. Interaction with other systems

### View resolution

The view and renderer system uses the settings cascade to resolve which renderer to use for a node.
The `default-renderer` setting is the primary example.

View resolution (see view and renderer doc, section 4) checks:

1. Node-specific view override (edge from node to ViewDefinition).
2. Settings cascade for the `default-renderer` setting at the relevant scope.
3. System default ViewDefinition for the node type.

The settings cascade is step 2 in this process.

### Query engine

Settings resolution is a query.
It uses the same execution engine as all other queries.
The programmatic API wraps it for convenience, but it is not a special mechanism.

### Bootstrap

Initial settings schemas are created during bootstrap.
They define the settings that the application supports out of the box.

---

## 8. What this document does not cover

| Concern                              | Where it belongs                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| Which specific settings exist        | Individual subsystem docs (view, editor, sync, etc.)                         |
| Settings UI (preferences panel)      | UI/interaction design                                                        |
| Extension-defined settings schemas   | [Extension and execution model](2026-02-08-extension-and-execution-model.md) |
| Settings export/import across vaults | Future consideration                                                         |

---

## 9. Open questions

1. Whether extensions or imported vocabularies can define their own settings schemas.
2. Settings portability across vaults: export/import mechanism for user preferences.
3. Whether settings should support inheritance within type hierarchies (if type inheritance is added).
4. Performance optimization for settings resolution queries (caching, materialized views).
5. Whether settings changes should trigger re-rendering of affected nodes immediately or lazily.
6. Whether there is a "reset to default" operation that removes a user override (deleting the settings node vs setting its value to a sentinel).
