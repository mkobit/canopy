# Graph canvas components

## Overview

This directory implements the ReactFlow-based interactive graph canvas, custom node and edge renderers, standalone node card view, quick-entry capture overlay, and keyboard/ARIA accessibility helpers.

## Interface

- `[aria-live-region.tsx:AriaLiveRegionProperties]` Exported props interface for `AriaLiveRegion` (optional `message` and `'status' | 'alert'` `role`).
- `[aria-live-region.tsx:AriaLiveRegion]` Exported React component rendering an `sr-only` ARIA live region.
- `[aria-live-region.tsx:useAriaLiveAnnouncer]` Exported React hook returning `{ announcement, announce }`.
- `[custom-edge.tsx:CustomEdge]` Exported `React.memo` custom ReactFlow edge component.
- `[custom-node.tsx:CustomNode]` Exported `React.memo` custom ReactFlow node component.
- `[edge-view.tsx:GraphNode]`, `[edge-view.tsx:EdgeViewProperties]`, `[edge-view.tsx:EdgeView]` Exported positioned node type, props interface, and standalone SVG `<g>` edge component.
- `[graph-canvas.tsx:GraphCanvas]` Exported standalone spatial-navigable graph visualization canvas component rendering `NodeView` and `EdgeView`.
- `[interactive-graph-view.tsx:InteractiveGraphView]` Exported ReactFlow graph canvas component.
- `[node-view.tsx:NodeViewData]`, `[node-view.tsx:NodeViewEvents]`, `[node-view.tsx:NodeViewProperties]`, `[node-view.tsx:NodeView]` Exported props and standalone node card component.
- `[quick-entry-overlay.tsx:QuickEntryOverlayProperties]`, `[quick-entry-overlay.tsx:QuickEntryOverlay]` Exported props and floating quick-entry form/button overlay.
- `[use-spatial-graph-navigation.ts:NavigationNode]`, `[use-spatial-graph-navigation.ts:SpatialNavigationOptions]`, `[use-spatial-graph-navigation.ts:ReactKeyboardEvent]`, `[use-spatial-graph-navigation.ts:useSpatialGraphNavigation]` Exported spatial keyboard navigation hook and types.

## Invariants

- `[aria-live-region.tsx:AriaLiveRegion]` Always renders `aria-live="polite"`, `aria-atomic="true"`, and `data-testid="aria-live-region"`, defaulting `message` to `''` and `role` to `'status'`.
- `[custom-node.tsx:CustomNode]` Returns `null` if `data.node` is `undefined`; `customNodePropertiesAreEqual` memoizes strictly on `selected`, `id`, `data?.node` reference, `dragging`, `targetPosition`, `sourcePosition`, and `isConnectable`.
- `[custom-edge.tsx:CustomEdge]` `customEdgePropertiesAreEqual` memoizes strictly on `id`, `selected`, `sourceX`, `sourceY`, `targetX`, `targetY`, `sourcePosition`, `targetPosition`, `label`, and `markerEnd`.
- `[interactive-graph-view.tsx:InteractiveGraphView]` Positions `graph.nodes` in a deterministic 4-column grid (`rowLimit=4`, `spacingX=350`, `spacingY=200`, `origin=(100, 100)`) and configures ReactFlow with `onlyRenderVisibleElements={true}` and `fitView`.
- `[node-view.tsx:NodeView]` Derives `aria-label` from string `'name'` or `'title'` property (falling back to type and 6-char node ID prefix).
- `[quick-entry-overlay.tsx:QuickEntryOverlay]` Only invokes `onSubmit` when `inputValue.trim()` is non-empty.
- `[use-spatial-graph-navigation.ts:useSpatialGraphNavigation]` Skips handling if `event_.defaultPrevented` is `true` or `event_.target` is `input`, `textarea`, or `contentEditable`; `Escape` clears selection; arrow keys select `nodes[0]` when nothing is selected or the closest node (`min dx^2+dy^2`) with positive `dotProduct` along the direction vector.

## Side Effects

- `[interactive-graph-view.tsx:InteractiveGraphView]` `useEffect` overwrites ReactFlow nodes and edges state via `setNodes(initialNodes)` and `setEdges(initialEdges)` when graph-derived arrays change.
- `[interactive-graph-view.tsx:InteractiveGraphView]` `onNodeClick` updates `selectedNodeId`, triggers ARIA live announcement, and navigates to `/graph/${graphId}/node/${node.id}`.
- `[interactive-graph-view.tsx:InteractiveGraphView]` `onConnect` and `onDoubleClick` call `showPrompt`, invoke `createEdge` / `createNode` (alerting on failure via `withResultAlert`), and update ARIA live announcement.
- `[node-view.tsx:NodeView]` Invokes optional `onClick(node)` callback on click.
- `[quick-entry-overlay.tsx:QuickEntryOverlay]` `handleSubmit` calls `event_.preventDefault()`, invokes `onSubmit(inputValue.trim())`, clears `inputValue`, and collapses `isExpanded`.
- `[use-spatial-graph-navigation.ts:useSpatialGraphNavigation]` `handleKeyDown` calls `event_.preventDefault()` on `Escape` and arrow keys and invokes `onSelectNode`.

## Verification

- Run: `bun test`
