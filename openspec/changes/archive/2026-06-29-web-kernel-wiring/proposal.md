## Why

The web app has a `GraphContext`, `useGraph` hook, storage round-trip, and page components (Home, Graph, Node, Search, View), but several gaps prevent the kernel from being usable end-to-end:

1. `createSyncEngine` never calls `bootstrap()` — new graphs have no system nodes, so all stored queries and system views fail silently.
2. `SearchPage` links navigate to `/node/:nodeId` (absolute, no route) instead of `node/:nodeId` (relative within graph).
3. System views (`VIEW_ALL_NODES`, `VIEW_BY_TYPE`, `VIEW_RECENT`) exist in `SYSTEM_IDS` and `ViewPage` can render them, but there is no navigation entry point to reach them.

## What changes

- Bootstrap system nodes during graph creation on `HomePage`
- Fix `SearchPage` node link to use a relative path
- Add a "Views" section to `SideNavBar` that shows system view links when a graph is active
- Change `Layout.handleNewNode` and `QuickEntryOverlay` to use `SYSTEM_IDS.TYPE_MARKDOWN` instead of arbitrary string types

## Capabilities

### Modified capabilities

- `ui-graph-context`: `GraphContext` / `useGraph` now produces graphs with system nodes on first load
- `ui-navigation`: `SideNavBar` is graph-context-aware; system views are reachable

## Impact

- `apps/web/src/pages/home-page.tsx` — bootstrap bridge in `handleCreateGraph`
- `apps/web/src/pages/search-page.tsx` — link path fix (one character)
- `apps/web/src/components/layout/side-nav-bar.tsx` — add Views section
- `apps/web/src/components/layout.tsx` — pass `graphId` to `SideNavBar`
- `apps/web/src/components/graph/quick-entry-overlay.tsx` (if type is hardcoded there) — use `TYPE_MARKDOWN`
