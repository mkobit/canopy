## Context

Canopy's type system is meta-circular: `NodeType`/`EdgeType` definitions are themselves nodes, validated by looking up their definition node in the graph (`validateNode` in `packages/graph/src/validation.ts:203`).
Today this machinery is only exercised by application code at bootstrap time (`packages/graph/src/bootstrap.ts`) — there is no runtime path for creating a new `NodeType`, `EdgeType`, or `Namespace`.

`namespace` is currently a closed string union (`packages/graph/src/namespace.ts`): `'system' | 'user' | 'imported' | 'user-settings'`.
Resolution already works by string comparison (`node.properties.namespace ?? node.type.namespace`, per `docs/design/2026-02-06-core-data-model.md` section 5) — the enum is the only thing preventing new namespace values from being valid.

`PropertyType` is described in the core data model doc (section 6) as one of 3 layer-1 metatypes, but only its validation half exists (`validatePropertyByType`, `validation.ts:241`) — there is no `SYSTEM_IDS` entry, no bootstrap-created definition node, and no creation op.

## Goals / Non-Goals

**Goals:**
- Namespace becomes a first-class, listable, queryable graph node — closing open question #6 in `core-data-model.md` section 10.
- Any of the 3 layer-1 metatypes (NodeType, EdgeType, PropertyType) can be authored at runtime, in any non-restricted namespace, without a code change.
- The 4 existing namespaces keep working exactly as before from every other package's point of view (same string values, same resolution semantics) — only their backing representation changes.
- Public API surface added to `@canopy/graph` stays at exactly 4 new ops.

**Non-Goals:**
- Editing or deleting an existing Namespace/NodeType/EdgeType/PropertyType definition. Definitions are create-only; evolving a type means creating a new one.
- PropertyType constraint validation (format/range/enum rules) — `PropertyType` here is `name` + `valueKind` only, constraints stay a documented future concern.
- Namespace import mechanics (schema.org vocab, cross-user type import) — this builds the primitive (`Namespace` as a node) that an importer would target later, not the importer.
- Changing `EdgeType` source/target enforcement from best-effort (warnings) to hard validation.
- Domain content types (Task/Project/Person). This change is the control plane only; using it to author domain types is a separate follow-on.

## Decisions

**Namespace is a node, not just a wider string enum.**
Alternative considered: keep `namespace` as a plain string and just drop the fixed union for an open string validated by format only.
Rejected because it leaves namespaces invisible to the graph — no listing, no metadata (`description`, `kind`), no queryability, and it doesn't resolve the doc's open question.
Making `Namespace` a node costs one more self-describing metatype (the codebase already has this exact pattern for NodeType/EdgeType) and pays for itself immediately: the Schema UI needs a list of namespaces to populate its picker, and "query the graph for nodes of type Namespace" is that list for free.

**`namespace` property values stay plain strings (the `Namespace` node's `name`), not `NodeId` references.**
Alternative considered: store a `NodeId` pointing at the `Namespace` node, consistent with how other references work (e.g. edge `source`/`target`).
Rejected because every existing namespace comparison in the codebase (`namespace.ts`, `resolve-namespace.ts`, and call sites across `@canopy/settings`/`@canopy/storage`) does plain string equality today. Switching to `NodeId` would touch every one of those call sites for a change that isn't required by anything in this proposal's scope. Keeping `namespace` a string and adding a `Namespace` node registry alongside it is strictly additive at the call-site level: only the *validity check* (does this string correspond to a real namespace) changes, not the storage shape.

**`kind` is an open string, not a boolean.**
Alternative considered: a `protected: boolean` flag directly on the Namespace node.
Rejected per explicit user direction: a boolean can only ever express one axis of specialness. `kind: string` (e.g. `"system"`, `"user"`, `"imported"`) plus a code-level `RESTRICTED_NAMESPACE_KINDS` set means a future new restricted classification is a one-line addition to that set, not a data migration touching every existing Namespace node.

**The 4 existing namespaces are migrated, not left as a hardcoded parallel path.**
Alternative considered: keep the 4 strings hardcoded as always-valid, and only require a `Namespace` node lookup for namespaces created after this change ships.
Rejected because it creates two permanent, divergent validation paths (a `switch` on 4 literals in one place, a graph lookup in another) — exactly the kind of surface-area growth the project is trying to avoid (see: keep public APIs and code paths narrow). A one-time bootstrap migration event (fits the existing "schema changes are events" principle from the event-system doc) creating 4 `Namespace` nodes is a bounded, one-way cost that leaves exactly one validation path afterward.

**Four dedicated ops, not one generic `defineType(kind, input)`.**
Alternative considered: a single parameterized op dispatching on a `kind` argument (`"namespace" | "nodetype" | "edgetype" | "propertytype"`).
Rejected because each of the 4 has a different input shape and different validation rules (e.g. only `createNamespace` checks `RESTRICTED_NAMESPACE_KINDS` against the *new* namespace's own kind; `createNodeType`/`createEdgeType`/`createPropertyType` check it against the *target* namespace they're writing into). A generic op would need an internal branch per kind anyway, just hidden behind one misleadingly-uniform signature. Four small, named, single-purpose functions match the existing convention (`createUserSetting` in `@canopy/settings`) and keep each function's contract legible on its own.

**Definitions are create-only.**
Alternative considered: allow editing a NodeType's property list in place (e.g. to add a newly-needed optional property).
Rejected because it re-opens the "nodes are never mutated in place" invariant at the type-definition level, and it's unnecessary: structural-typing validation already tolerates extra properties beyond what's declared, so most "I need to add a property" cases need no definition change at all. Genuine breaking changes (new required property, changed `valueKind`) are handled by creating a new type — old instances and the old definition are simply left alone, which is also just... the existing event-sourced philosophy applied one level up.

## Risks / Trade-offs

- **[Risk] Migrating the 4 existing namespaces to nodes could break any code path that special-cases the literal strings `'system'`/`'user'`/`'imported'`/`'user-settings'`.**
  → Mitigation: the migration is additive at the string level (the strings themselves don't change, only what makes them "valid"). An audit of all `namespace.ts` / `resolve-namespace.ts` call sites is a required task before removing the old enum check, not after.
- **[Risk] A user could create many low-value namespaces/types with no cleanup mechanism (create-only, no delete).**
  → Mitigation: acceptable for this stage — the project is pre-domain-content and effectively dogfooding-only right now. General node tombstoning (`NodeDeleted`) already exists at the graph level if cleanup is needed later; this change doesn't need to solve it.
- **[Risk] `RESTRICTED_NAMESPACE_KINDS` as a code-level set (not data-driven) means adding a new restricted kind requires a deploy.**
  → Mitigation: acceptable trade-off — this is intentionally a small, explicit, auditable list rather than a runtime-configurable policy, consistent with keeping the public surface narrow.

## Migration Plan

1. Add `Namespace` metatype (`NAMESPACE_DEF`/`NAMESPACE` in `system.ts`) and `PropertyType` metatype (`PROPERTY_TYPE_DEF`/`PROPERTY_TYPE`) alongside the existing `NodeType`/`EdgeType` entries.
2. Add a bootstrap migration step emitting `NodeCreated` events for 4 `Namespace` nodes (`system` [kind: `"system"`], `user`, `imported`, `user-settings` [kind: `"user"` or similar non-restricted kind]), tagged with migration metadata per the existing bootstrap migration-event convention.
3. Rewrite namespace validity checks (`validation.ts`, `resolve-namespace.ts`) to look up `Namespace` nodes by `name` instead of matching the old 4-literal union. Remove the old union type once nothing references it.
4. Add the 4 new ops in `packages/graph/src/ops/`.
5. Build the `apps/web` Schema UI section on top of the new ops.
- **Rollback**: this is additive graph state (new metatypes + 4 new nodes via a migration event) plus a validation rewrite. Rolling back means reverting the code change; no external data format changes, so no data rollback is needed beyond replaying events from before the migration event if a fresh vault needs to avoid it entirely.

## Open Questions

None outstanding — all decisions above were made explicitly during the brainstorming session preceding this change. Follow-on work (domain content types, PropertyType constraints, namespace import mechanics) is tracked as future, separate changes, not open questions within this one.
