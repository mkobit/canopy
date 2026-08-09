## Why

Authoring a `NodeType` gives you a typed node but no way to see instances of it — a `ViewDefinition` must be hand-authored separately through the query/view control plane before anything renders as a list or table.
The lookup half of "type implies a default view" already exists (`packages/settings/src/view-resolution.ts:33` reads `indexes.defaultViews` keyed by `nodeType`), but nothing populates that map when a type is created, so the map is always empty for user-authored types and resolution falls through to failure.
A declared `NodeType` already carries everything needed to render a sensible default table (its property list), so requiring a second authoring step is avoidable ceremony — the same zero-config table view Logseq gets for free from a tag's declared properties.

## What Changes

- Add a graph op that, given a just-created `NodeType` node, generates a **default table `ViewDefinition`** for it: `layout: "table"`, `displayProperties` = the type's declared property names, backed by a generated `QueryDefinition` that scans nodes of that type, linked to the type by a `default_view` edge so it populates `indexes.defaultViews`.
- Wire that generation into `createNodeType` so a newly authored type gets its default view with no extra call. `createNodeType`'s success result now carries the view/query/edge creations in addition to the `NodeType` node.
- Generated definitions live in the **same namespace** as the authored type (never a restricted namespace), are ordinary graph nodes, and are overridable/replaceable through the existing view-resolution cascade (a user-authored view or `default-view` setting still wins over the generated default).
- No changes to `resolveViewDefinition` — it already consumes `indexes.defaultViews`; this change only populates it.

## Capabilities

### New Capabilities

- `default-view-generation`: when a `NodeType` is authored, the system generates a default table `ViewDefinition` (plus a backing `QueryDefinition` and a `default_view` edge) so instances of the new type are viewable with zero additional authoring, while remaining fully overridable by the existing view-resolution cascade.

### Modified Capabilities

- `type-authoring`: `createNodeType`'s contract gains the side effect of also emitting the generated default view/query/edge; the op's result now reports these additional creations alongside the `NodeType` node.

## Impact

- `packages/graph/src/ops/type-authoring.ts` — `createNodeType` composes in default-view generation; likely a new op (e.g. `generateDefaultView`) alongside it.
- `packages/graph` events/projection — `createNodeType` now yields multiple creations (`NodeType`, `QueryDefinition`, `ViewDefinition`, `default_view` edge) instead of one; callers and the `GraphResult` shape are affected.
- `packages/graph/src/indexes.ts` — `defaultViews` becomes populated for user types via the emitted `default_view` edge (already handled by existing index maintenance; no new index code expected).
- `packages/settings/src/view-resolution.ts` — unchanged; behavior improves because step 3 (default views) now resolves for authored types.
- `apps/web` type-authoring flows and e2e (`domain-content-types.e2e.ts`, `cadence.e2e.ts`) — newly authored types gain a resolvable default view; existing assertions to be checked for compatibility.
- Grounds: `canopy-cxf`.
