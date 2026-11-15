# Web route pages

## Overview

This directory defines the seven top-level React route page components for graph selection, graph exploration, node inspection and editing, schema management, node search, and stored view rendering. They coordinate URL params, `useGraph`/`useStorage` context mutations, and React Router navigation.

## Interface

- `[home-page.tsx:HomePage]` Graph registry list, creation, deletion, and navigation page.
- `[graph-page.tsx:GraphPage]` Graph workspace shell rendering child `<Outlet>` or `<InteractiveGraphView>` with `<QuickEntryOverlay>` and `<InspectorPanel>`.
- `[node-page.tsx:NodePage]` Single-node inspector, property editor, `BlockEditor` content editor, and delete handler.
- `[schema-page.tsx:SchemaPage]` Namespace listing and `<NamespaceCreateForm>` page.
- `[schema-namespace-page.tsx:SchemaNamespacePage]` Namespace detail page with node type, edge type, and property type creation forms.
- `[search-page.tsx:SearchPage]` Client-side node search page over `SYSTEM_IDS.QUERY_ALL_NODES`.
- `[view-page.tsx:ViewPage]` Stored `ViewDefinition` executor rendering `TableLayout`, `ListLayout`, or `CardsLayout`.

## Invariants

- `[graph-page.tsx:GraphPage]` Renders loading state when `isLoading` is `true`, error fallback when `error` is truthy, and `null` when `!graph`; renders `<InspectorPanel>` only when `isInspectorOpen && selectedNode` are truthy.
- `[home-page.tsx:HomePage]` Guards `loadGraphs`, `handleCreateGraph`, and `handleDeleteGraph` on `registry` being truthy; aborts creation/deletion when `showPrompt`/`showConfirm` returns falsy.
- `[node-page.tsx:NodePage]` Excludes `'content'` from `propertiesToEdit` (`key !== 'content'`), renders `<BlockEditor>` only when `typeof content === 'string'`, renders `'Node not found'` when `!currentNode || !graph`, and requires `showConfirm('Delete this node?')` before deleting.
- `[schema-namespace-page.tsx:SchemaNamespacePage]` and `[schema-page.tsx:SchemaPage]` Render `'No graph loaded.'` when `!graph` and compute restricted status via `RESTRICTED_NAMESPACE_KINDS.has(kind)`.
- `[search-page.tsx:SearchPage]` Renders `'Loading...'` when `!graph`; filters `executeStoredQuery(graph, SYSTEM_IDS.QUERY_ALL_NODES)` by case-insensitive substring match on `node.id` or string `'name'` property, returning empty when query is empty.
- `[view-page.tsx:ViewPage]` Renders `'No graph loaded.'` when `!graph || !viewId`, `'Loading view…'` when `!viewResult`, and an error banner when `!viewResult.ok`; selects layout by `definition.layout` (defaulting to `TableLayout`).

## Side Effects

- `[graph-page.tsx:GraphPage]` Calls `loadGraph(asGraphId(graphId))` in `useEffect`, calls `createNode` wrapped in `withResultAlert` on quick entry, and navigates to `'/'` on error reset.
- `[home-page.tsx:HomePage]` Calls `registry.list()`, `registry.upsert(...)`, and `registry.delete(id)`, reads `Temporal.Now.instant().toString()`, shows prompt/confirm dialogs, navigates to `/graph/${id}`, and logs errors with `console.error`.
- `[node-page.tsx:NodePage]` Calls `updateNodeProperties` and `deleteNode`, shows confirm dialogs, navigates on delete/back/link clicks, and logs content commit failures with `console.error`.
- `[schema-namespace-page.tsx:SchemaNamespacePage]` and `[schema-page.tsx:SchemaPage]` Pass `createNodeType`, `createEdgeType`, `createPropertyType`, and `createNamespace` mutations to schema forms and navigate between schema routes.
- `[view-page.tsx:ViewPage]` Navigates to `/graph/${graphId}/node/${node.id}` on node click.

## Verification

- Run: `bun test`
