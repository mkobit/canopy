## 1. Bootstrap system nodes on graph creation

- [ ] 1.1 Import `createGraph` from `@canopy/graph` and `createSyncEngine` from `@canopy/sync` in `home-page.tsx`
- [ ] 1.2 In `handleCreateGraph`: replace `storage.save(id, new Uint8Array(), ...)` with the bootstrap bridge — call `createGraph(id, name)`, iterate bootstrapped nodes into a new `SyncEngine` store, take snapshot, save snapshot
- [ ] 1.3 Assert (or log) that `bootstrappedGraph.edges.size === 0` to guard against silent edge data loss if bootstrap ever adds edges

## 2. Fix SearchPage navigation

- [ ] 2.1 In `search-page.tsx`: change `to={`/node/${node.id}`}` to `to={`node/${node.id}`}` (remove leading slash)

## 3. Wire system views into the sidebar

- [ ] 3.1 Add `graphId?: string` prop to `SideNavBarProps` in `side-nav-bar.tsx`
- [ ] 3.2 Import `SYSTEM_IDS` from `@canopy/graph` in `side-nav-bar.tsx`
- [ ] 3.3 Render a "Views" nav section below "Search" when `graphId` is defined; three links: All Nodes, By Type, Recent
- [ ] 3.4 In `layout.tsx`: pass `graphId={graph?.id}` to `<SideNavBar />`

## 4. Use `TYPE_MARKDOWN` for default node creation

- [ ] 4.1 In `layout.tsx` `handleNewNode`: change `createNode('Note', ...)` to `createNode(SYSTEM_IDS.TYPE_MARKDOWN, ...)`
- [ ] 4.2 In `graph-page.tsx` `handleQuickEntry`: change `createNode('RawNode', ...)` to `createNode(SYSTEM_IDS.TYPE_MARKDOWN, ...)`

## 5. Verify

- [ ] 5.1 Create a new graph — confirm system nodes are present (node count > 0 before any user data is added)
- [ ] 5.2 Create a node via QuickEntry — confirm it persists and appears in canvas
- [ ] 5.3 Search for the created node — confirm result appears and clicking navigates to node page
- [ ] 5.4 Navigate to All Nodes view via sidebar — confirm non-system nodes are listed
- [ ] 5.5 Navigate to Recent view — confirm ordering
- [ ] 5.6 Run `bun test`, `bun run typecheck`, `bun run lint` — all green
