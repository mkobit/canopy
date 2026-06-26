# Design: web kernel wiring

## Decisions

### Bootstrap timing: creation only

Bootstrap runs once, when the user creates a graph on `HomePage`.
It does not re-run on every `loadGraph` call.

**Rationale:** bootstrap is idempotent but adds overhead.
Persisting bootstrap output in the Yjs snapshot means subsequent loads are instant and pure.
If a graph predates this change and is missing system nodes, it will be missing them until re-created.

**Alternative considered:** run bootstrap inside `loadGraph` on every open, checking `SYSTEM_IDS.QUERY_ALL_NODES` presence as a sentinel.
Rejected because it ties every load to a bootstrap pass; the creation path is the right seam.

**Deferred question:** migration path for existing graphs missing system nodes.
Not addressed here. When this becomes real, options are: (a) add a one-time migration in `loadGraph` gated by a version stamp, (b) expose a "repair graph" action in settings.

---

### Bootstrap bridge: immutable Graph → Yjs store

`bootstrap()` in `@canopy/graph` operates on immutable `Graph` objects.
`GraphStore` in `@canopy/sync` is a Yjs-backed mutable store.

Bridge approach in `HomePage.handleCreateGraph`:
1. Call `createGraph(id, name)` — returns `Result<Graph, Error>` with all system nodes already present (bootstrap is called inside `createGraph`).
2. Create `createSyncEngine({})` — empty Yjs doc.
3. Iterate `bootstrappedGraph.nodes.values()`, call `engine.store.addNode({ id, type, properties })` for each.
4. Call `engine.getSnapshot()` and pass the `Uint8Array` to `storage.save(...)`.

The store's `addNode` does structural validation via `NodeSchema` (shape only, not type-graph existence), so insertion order does not matter.

**Deferred question:** edges in the bootstrap graph.
Currently `createGraph` produces no bootstrap edges (only nodes).
If bootstrap ever creates edges, this bridge must be extended to call `store.addEdge` for each.
Track: check `bootstrappedGraph.edges.size` in the implementation; assert it is 0 or handle it.

---

### Default node creation type: `SYSTEM_IDS.TYPE_MARKDOWN`

`Layout.handleNewNode` called `createNode('Note', ...)`.
`GraphPage.handleQuickEntry` called `createNode('RawNode', ...)`.

Both changed to `SYSTEM_IDS.TYPE_MARKDOWN`.

**Rationale:** `TYPE_MARKDOWN` is the only system type with a `content` property definition that maps to freeform text, which is what quick-capture and "new node" flows imply.
`'Note'` and `'RawNode'` are arbitrary strings; they pass `TypeIdSchema` (any non-empty string) but have no type definition node in the graph.

**Deferred question:** type picker for node creation.
When type-aware forms are built, the creation flow should present a list of available `NODE_TYPE` nodes from the graph and let the user pick.
At that point `TYPE_MARKDOWN` as default becomes a fallback, not a constant.

---

### System view navigation: graph-context-aware sidebar

`Layout` receives `graph` from `useGraph()` and already has `graph.id`.
It passes `graphId: graph?.id` as a new prop to `SideNavBar`.

`SideNavBar` renders a "Views" section when `graphId` is defined:

```
VIEWS
  All Nodes  → /graph/:graphId/view/<VIEW_ALL_NODES>
  By Type    → /graph/:graphId/view/<VIEW_BY_TYPE>
  Recent     → /graph/:graphId/view/<VIEW_RECENT>
```

Section is hidden when on the home page (no graph loaded).

**Alternative considered:** `SideNavBar` uses `useMatch('/graph/:graphId/*')` internally to detect context.
Rejected because it couples the nav component to routing internals; prop is simpler and more testable.

**Deferred question:** user-created view nav.
When users can create custom view definition nodes, the Views section should list them below system views, probably under a "My Views" sub-heading.
The mechanism is: query `listViewDefinitions(graph)` from `@canopy/queries`, filter to non-system views, render as nav links.

---

## Open questions

| # | Question | Trigger to revisit |
|---|----------|--------------------|
| 1 | Migration path for graphs created before bootstrap wiring | When real data is at stake (multi-user, cloud sync) |
| 2 | Bootstrap edges — are any produced now or planned? | Any time `createGraph` output changes |
| 3 | Type picker for node creation | When type-aware forms change is started |
| 4 | User-created views in sidebar | When view creation UI is built |
| 5 | Claude design prototype — were design decisions captured elsewhere? | User noted prior design prototyping; confirm design tokens / component choices are intentional before restyling |
