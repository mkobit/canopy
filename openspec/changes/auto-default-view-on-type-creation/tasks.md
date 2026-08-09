## 1. Default-view generation helper (@canopy/graph)

- [ ] 1.1 Add a private `generateDefaultView(graph, nodeTypeNode, properties, options)` helper in `packages/graph/src/ops/type-authoring.ts` that returns `Result<GraphResult<Graph>, ValidationError>` accumulating: a `QueryDefinition` node (`{ steps: [{ kind: 'node-scan', type: <nodeTypeId> }] }`), a `table` `ViewDefinition` node (`layout: "table"`, `queryRef` → the query, `displayProperties` = `properties.map(p => p.name)`), and a `default_view` edge from the `NodeType` node to the `ViewDefinition`.
- [ ] 1.2 Create generated nodes in the `NodeType`'s namespace using `createNodeId()`; derive names from the type name (query `"<TypeName> (all)"`, view `"<TypeName> (table)"`); use `SYSTEM_IDS.QUERY_DEFINITION` / `SYSTEM_IDS.VIEW_DEFINITION` node types and `SYSTEM_EDGE_TYPES.DEFAULT_VIEW` for the edge (confirm these ids in `system.ts`).
- [ ] 1.3 Thread the graph through `addNode` → `addNode` → `addEdge`; on any sub-step `err`, return that error and emit nothing (all-or-nothing).

## 2. Wire generation into createNodeType

- [ ] 2.1 In `createNodeType`, after the `NodeType` `addNode` succeeds, call `generateDefaultView` with the already-resolved `propertiesResult.value` and merge its events after the `NodeType` `NodeCreated` event (NodeType event MUST be first).
- [ ] 2.2 Return a single `GraphResult` whose `events` are `[NodeType, QueryDefinition, ViewDefinition, default_view]` in that order and whose `value` is the `NodeType` node/graph, unchanged in type from today.
- [ ] 2.3 Confirm `createEdgeType` and `createPropertyType` are untouched (no default-view generation).

## 3. Unit tests (@canopy/graph)

- [ ] 3.1 Test: `createNodeType` with declared properties emits 3 `NodeCreated` events + 1 `EdgeCreated`; the first `NodeCreated` is the `NodeType`; the `ViewDefinition` has `layout: "table"` and `displayProperties` equal to the declared property names.
- [ ] 3.2 Test: the generated `QueryDefinition.definition` scans the new type id; the `default_view` edge source is the `NodeType` and target is the `ViewDefinition`.
- [ ] 3.3 Test: type with empty property list still generates a resolvable view with empty `displayProperties`.
- [ ] 3.4 Test: generated `ViewDefinition`/`QueryDefinition` carry the same `namespace` as the authored type.
- [ ] 3.5 Test: a failed `createNodeType` (duplicate name) emits no view/query/edge events.

## 4. Resolution integration test (@canopy/settings)

- [ ] 4.1 Test: after authoring a type and projecting its events, `resolveViewDefinition` for an instance (no override, no setting) returns the generated `ViewDefinition` via `indexes.defaultViews`.
- [ ] 4.2 Test: a `view_override` edge and a `default-view` setting each take precedence over the generated default.

## 5. Caller and e2e compatibility

- [ ] 5.1 Verify `apps/web/src/context/graph-context.tsx` `commitCreatedNode` still returns the `NodeType` id (first `NodeCreated`) with no change; adjust only if the audit finds another consumer.
- [ ] 5.2 Update `apps/web/e2e/domain-content-types.e2e.ts` and `cadence.e2e.ts` if they assert exact event counts; add/extend an assertion that a newly authored type resolves a default view.
- [ ] 5.3 Update `packages/graph/src/ops/type-authoring.test.ts` expectations for the additional creations.

## 6. Quality gates

- [ ] 6.1 `bun run build` then `bun run lint`, `bun run typecheck`, `bun test` all green.
- [ ] 6.2 `bunx openspec validate auto-default-view-on-type-creation` passes.
