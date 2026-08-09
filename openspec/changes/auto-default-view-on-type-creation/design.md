## Context

`createNodeType` (`packages/graph/src/ops/type-authoring.ts:203`) creates a single `NodeType` definition node and returns a `GraphResult` carrying one `NodeCreated` event.
Rendering a set of instances of that type requires a `ViewDefinition`, which today must be authored separately through the query/view control plane.
The view-resolution cascade already has the consuming half: `resolveViewDefinition` (`packages/settings/src/view-resolution.ts:8`) checks, in order, a node-level `view_override` edge, the `default-view` setting cascade, then `indexes.defaultViews` keyed by `nodeType` (`view-resolution.ts:33`).
`indexes.defaultViews` is populated from `default_view` edges (`packages/graph/src/indexes.ts:437`), but nothing emits such an edge for a user-authored type, so the map is empty for every non-system type and resolution falls through to a failed `Result`.

Two enabling facts make this a small, self-contained change:

1. `GraphResult<T>` already carries `events: readonly GraphEvent[]` (`packages/graph/src/events.ts:103`) — a list, not a single event — so a multi-creation op needs no result-shape change.
2. The query DSL's `node-scan` step takes an optional `type` (`packages/queries/src/model.ts:23`), and instances of an authored type carry `node.type === <NodeType node id>`, so a query that scans that type is `{ steps: [{ kind: 'node-scan', type: <nodeTypeId> }] }`.

## Goals / Non-Goals

**Goals:**

- Authoring a `NodeType` yields a resolvable default table `ViewDefinition` with zero additional calls.
- The generated view has one column per declared property (`displayProperties` = declared property names).
- The generated default remains the lowest-precedence resolution result; user overrides and settings still win.
- Keep the op a pure function returning `Result<GraphResult<Graph>, ValidationError>`, consistent with the rest of the type-authoring ops and the functional invariants.

**Non-Goals:**

- Backfilling default views for `NodeType`s authored before this change (pre-release, no real vaults exist — see `project_pre_release_status`).
- Generating default views for `EdgeType` or `PropertyType`.
- De-duplicating or sharing generated `QueryDefinition`/`ViewDefinition` nodes across types (each type gets its own; reuse is a separate concern).
- Any UI work to render or edit the generated view — this change only makes resolution succeed; the existing renderer path consumes it unchanged.
- A user-facing opt-out flag (deferred; see Open Questions).

## Decisions

### Decision: Emit the view artifacts as additional events in `createNodeType`'s existing `GraphResult`

`createNodeType` composes the three extra creations (`QueryDefinition` node, `ViewDefinition` node, `default_view` edge) after the `NodeType` node, threading the graph through `addNode`/`addEdge` and accumulating their events into the returned `events` array.
No new op is added to the public surface; the additional work is a private helper (`generateDefaultView(graph, nodeTypeNode, properties, options)`) that returns the accumulated `GraphResult`, keeping it independently testable and reusable by a future backfill migration.

Rationale: `GraphResult.events` is already a list, so this is the least-surprising extension of the existing contract and requires no changes to `session.commit`, which commits an event array atomically.

Alternatives considered:

- A separate public op the caller invokes after `createNodeType` — rejected: reintroduces the second-step ceremony this change exists to remove, and every call site would have to remember to call it.
- Seeding the view lazily at resolution time (generate on first `resolveViewDefinition` miss) — rejected: `resolveViewDefinition` is a pure read in `@canopy/settings` and must not mutate the graph or emit events; violates invariants 4/6/8 and the read/write split.

### Decision: Emit the `NodeType` `NodeCreated` event first

The event order is `[NodeType, QueryDefinition, ViewDefinition, default_view edge]`.

Rationale: the web caller `commitCreatedNode` (`apps/web/src/context/graph-context.tsx:58`) extracts the created id via `events.find(e => e.type === 'NodeCreated')` — the _first_ match.
Emitting the `NodeType` first means that caller keeps returning the `NodeType`'s id with no change.
An audit found `commitCreatedNode` is the only consumer of `createNodeType`'s result; documenting the ordering as a contract guards future callers.

### Decision: Generated definitions live in the authored type's namespace

Both generated nodes carry `namespace` = the `NodeType`'s namespace.
`createNodeType` already guarantees that namespace is non-restricted (`checkNamespaceWritable`), so no restricted-namespace write is possible and no additional check is needed.

Rationale: keeps a type and its generated view co-located and co-governed; a system-namespace write would violate the type-authoring restricted-kinds rule.

### Decision: Query targets the type by the `NodeType` node id; view is `table` with declared property columns

The generated `QueryDefinition.definition` is `{ steps: [{ kind: 'node-scan', type: <nodeTypeId> }] }`.
The generated `ViewDefinition` has `layout: "table"`, `queryRef` → the generated query, and `displayProperties` = `properties.map(p => p.name)` (the already-resolved `PropertyDefinition[]` that `createNodeType` computes at `type-authoring.ts:217`).
Ids are random (`createNodeId()`), matching every other `create*` op; names are derived from the type name (e.g. `"<TypeName> (table)"`).

Rationale: reuses values `createNodeType` already has in hand; `table` + one-column-per-property is the sensible default the proposal calls for.

### Decision: Any sub-step failure fails the whole op and emits nothing

If any `addNode`/`addEdge` in the chain returns `err`, `createNodeType` returns that error and no events are surfaced; `session.commit` is never called with a partial batch.

Rationale: preserves all-or-nothing semantics for the caller and avoids a half-created type-without-view or view-without-edge state.

## Risks / Trade-offs

- Multiple `NodeCreated` events from one op could break a caller that assumes exactly one → `NodeType` event emitted first so `.find`-style callers are unaffected; sole current caller (`commitCreatedNode`) audited; ordering documented as contract.
- Types with many declared properties produce a very wide table → UI-only concern; `displayProperties` is advisory and the renderer/UI can truncate; explicitly a non-goal to cap here.
- Two types with identical property sets get separate, duplicated view/query nodes → accepted; 1:1 generation is simpler and correct; cross-type reuse is a distinct concern (adjacent to `canopy-eqd`) left out of scope.
- e2e/tests that assert an exact event count or a single `NodeCreated` for `createNodeType` will need updating → audit `domain-content-types.e2e.ts`, `cadence.e2e.ts`, and `type-authoring.test.ts`; update assertions to expect the additional creations.
- Slightly larger event log (3 events + 1 edge per authored type) → negligible relative to instance/content events; no index or projection algorithm change (default_view edge index maintenance is incremental, `indexes.ts:489`).

## Adversarial review and mitigations

**Resource and performance overhead.**
Each `createNodeType` now appends 3 nodes and 1 edge to the event log instead of 1 node — a constant, small increase paid once per type authored (not per instance).
Projection cost scales with total events; the delta is bounded by the number of types, which is tiny compared to content nodes.
`default_view` edge index maintenance is incremental O(1) per edge (`packages/graph/src/indexes.ts:489`), so `indexes.defaultViews` population adds no scan.
Mitigation: none required; overhead is constant and one-time per type.

**Failure modes and edge cases.**

- Empty declared-property list → generate a `table` view with empty `displayProperties`; still resolvable (spec scenario covers this).
- Duplicate property names within the type → `displayProperties` mirrors the declared list as-is; no dedup, matching the type's own stored `properties`; harmless to resolution.
- Property name colliding with a structural column the table renderer reserves (e.g. an identity column) → UI render concern only, not a resolution failure; renderer already tolerates arbitrary `displayProperties`.
- Sub-step failure mid-chain (e.g. `addEdge` fails) → op returns `err`, nothing committed (all-or-nothing decision above).
- Caller assuming a single `NodeCreated` → mitigated by `NodeType`-first ordering.
  Mitigation: ordering contract + all-or-nothing return + spec scenarios for empty/failed paths.

**Security and isolation.**
Generated definitions are written only into the authored type's namespace, which `createNodeType` has already proven non-restricted via `checkNamespaceWritable`; no path writes into a `system`/restricted namespace.
The generated query scans only the new type; it grants no read/traverse capability beyond what any user query already has.
No new external input is trusted — property names come from the same validated `PropertyDefinition[]` used to build the type.
Mitigation: reuse the existing restricted-namespace guarantee; no new trust boundary introduced.

**Migration and backward compatibility.**
`GraphResult`'s shape is unchanged (`events` was already a list), so no serialized-format or API-type break.
`NodeType`s authored before this change keep resolving exactly as today (fall through to failure) — no regression, just no retroactive benefit; backfill is a deliberate non-goal given pre-release status.
System types keep their bootstrap-seeded views; this op only runs for runtime-authored types, so bootstrap is untouched.
Rollback = revert the op change; any already-generated view/query nodes remain valid ordinary graph nodes and continue to resolve, so rollback is non-destructive.
Mitigation: additive-only behavior, no format change, non-destructive rollback.

## Open Questions

- Should `CreateNodeTypeInput` gain an optional `generateDefaultView?: boolean` (default `true`) opt-out? Deferred until a concrete need surfaces; default-on matches the proposal's intent.
- Should a one-time backfill migration generate default views for types authored before this change? Deferred (pre-release, no real vaults); the `generateDefaultView` helper is factored to make such a migration straightforward later.
- Is `"table"` always the right default layout, or should it vary by property count/kinds (e.g. `cards` for property-less types)? Start with `table` uniformly; revisit if real usage shows friction (per `feedback_constrain_speculative_design`).
