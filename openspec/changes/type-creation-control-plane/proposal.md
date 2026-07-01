## Why

`packages/graph/src/system.ts` only defines meta/system-level node types (node-type, edge-type, query-definition, view-definition, template, settings-schema, user-setting, text-block, code-block, markdown, workflow-trigger, workflow-definition).
There are no domain content types (task, project, person, etc.) yet, and there is no way to add any: `apps/web` only ships a whitelisted node-*instance* creation dialog (`new-node-dialog.tsx`), never a way to define a brand new `NodeType`, `EdgeType`, or `PropertyType`.
`namespace` (`packages/graph/src/namespace.ts`) is also a closed 4-value enum (`system` | `user` | `imported` | `user-settings`) with no UI exposure, which blocks introducing any new namespace at all without a code change.

This change builds the missing control plane so new types and namespaces can be authored without editing application code.
Domain content types (Task/Project/Person) are an explicit follow-on, created by dogfooding this control plane's UI once it exists — not part of this change.

## What Changes

- Namespace becomes a first-class, self-describing graph node type (a 4th layer-1 metatype alongside NodeType/EdgeType/PropertyType), resolving the open question in `docs/design/2026-02-06-core-data-model.md` section 10 (#6).
  - Schema: `name` (string, required, unique), `description` (string, optional), `kind` (string, required, open-ended — e.g. `"system"`, `"user"`, `"imported"`; not a boolean, so new classifications can be added later without a data migration on existing nodes).
  - A code-level `RESTRICTED_NAMESPACE_KINDS` set (starts as `{"system"}`) governs which kinds ordinary users cannot create into or create namespaces of that kind.
- **BREAKING (internal only, no external consumers yet)**: the 4 existing hardcoded namespaces (`system`, `user`, `imported`, `user-settings`) are migrated to real `Namespace` nodes via a bootstrap migration event. Namespace validation (`validation.ts`, `resolve-namespace.ts`) switches entirely from the old fixed string-enum check to "does a non-deleted `Namespace` node exist with this name" — the old enum check is removed, not kept alongside the new one.
- `PropertyType` is completed as a full layer-1 metatype (it is currently only partially implemented: `validatePropertyByType` in `validation.ts:241` validates against arbitrary PropertyType nodes by ID, but there is no `SYSTEM_IDS` entry, no bootstrap registration, and no creation op), following the same self-describing pattern already used for `NodeType`/`EdgeType`.
- Four new ops in `packages/graph/src/ops`: `createNamespace`, `createNodeType`, `createEdgeType`, `createPropertyType`. Each is a pure function returning `Result<{event, graph}, ValidationError>` and enforces the restricted-namespace-kind rule.
- All four definition kinds (Namespace, NodeType, EdgeType, PropertyType) are **create-only** through this control plane: no edit or delete operation is introduced. Evolving a type means creating a new type (a new version), not mutating an existing definition.
- New "Schema" section in `apps/web`: lists namespaces and, per namespace, lists/creates NodeTypes, EdgeTypes, and PropertyTypes. NodeType/EdgeType forms share a property-list editor supporting both inline property definitions and references to existing PropertyType nodes.

## Capabilities

### New Capabilities

- `type-authoring`: namespace-as-node data model, the four create ops (`createNamespace`/`createNodeType`/`createEdgeType`/`createPropertyType`), restricted-namespace-kind enforcement, and the bootstrap migration of the 4 existing namespaces to real nodes. Lives in `@canopy/graph`.
- `schema-ui`: the `apps/web` "Schema" section — namespace list/create, per-namespace NodeType/EdgeType/PropertyType list/create forms, shared property-list editor component. Depends on `type-authoring`.

### Modified Capabilities

(none — no existing `openspec/specs/` capability has requirement-level changes; `eslint-functional-enforcement` is unaffected)

## Impact

- `packages/graph/src/system.ts`: new `SYSTEM_IDS` entries for `NAMESPACE_DEF`/`NAMESPACE`, `PROPERTY_TYPE_DEF`/`PROPERTY_TYPE`.
- `packages/graph/src/namespace.ts`: closed enum replaced by node-backed lookup; `RESTRICTED_NAMESPACE_KINDS` added.
- `packages/graph/src/validation.ts`, `resolve-namespace.ts`: namespace validity check rewritten against `Namespace` nodes.
- `packages/graph/src/bootstrap.ts`: migration step creating `Namespace` nodes for the 4 existing namespaces.
- `packages/graph/src/ops/`: 4 new op files.
- `apps/web/src/components/`: new Schema section components (list + create forms), reusing the existing `GraphProvider` context wiring pattern from `new-node-dialog.tsx`.
- No new package. No change to `@canopy/queries`, `@canopy/settings`, `@canopy/storage`, `@canopy/sync` public APIs.
- Related tracking: bd issue `canopy-9zj`.
