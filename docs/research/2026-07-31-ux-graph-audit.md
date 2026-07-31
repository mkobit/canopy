# Research: UX audit for graph navigation, accessibility, and rendering performance

## Executive summary

This UX research audit evaluates Canopy's interactive graph visualization components in [`apps/web/src/components/graph`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph).
It identifies critical gaps across keyboard spatial navigation, accessibility (WCAG 2.1 AA), and high-node-count rendering performance.
The audit establishes actionable benchmarks and prioritizes technical remediation sub-beads under epic [`canopy-gtv`](file:///home/mkobit/workspace/mkobit/canopy/docs/design/2025-01-21-canopy-design-v0.1.md).

## Evaluated components

The audit analyzed seven core graph UI components in [`apps/web/src/components/graph`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph):

- [`interactive-graph-view.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/interactive-graph-view.tsx#L30-L150): Primary ReactFlow canvas handling interactive node/edge interactions, dragging, and graph data binding.
- [`graph-canvas.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/graph-canvas.tsx#L30-L93): Lightweight SVG/HTML graph fallback renderer for static previews and storybook snapshots.
- [`custom-node.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/custom-node.tsx#L9-L43): ReactFlow custom node view rendering node type badges, IDs, and property key-value entries.
- [`custom-edge.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/custom-edge.tsx#L4-L55): ReactFlow custom bezier connector with interactive edge labels.
- [`node-view.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/node-view.tsx#L19-L59): DOM node card container used within static `GraphCanvas`.
- [`edge-view.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/edge-view.tsx#L19-L83): SVG path and arrow marker renderer used within static `GraphCanvas`.
- [`quick-entry-overlay.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/quick-entry-overlay.tsx#L7-L78): Floating dialog for rapid node and connection creation.

## Detailed audit findings

### 1. Keyboard spatial navigation and focus management

#### Current state

Nodes and edges in both `InteractiveGraphView` and `GraphCanvas` are not focusable via standard keyboard navigation (`Tab` or `Shift+Tab`).
Users cannot navigate between connected nodes using directional arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`).
Focus trapping is absent in modal overlays such as `QuickEntryOverlay`.

#### Target remediation

Implement `tabIndex={0}` and proper focus rings on active nodes.
Add a spatial arrow key navigation engine to jump focus to the visually closest neighbor node in the pressed direction.
Add `Escape` key handling to clear selections or dismiss quick entry dialogs.

### 2. Accessibility (a11y) and screen reader support

#### Current state

Graph containers lack top-level ARIA landmark roles such as `role="application"` or `role="graphics-document"`.
Individual node elements lack semantic roles like `role="button"` or `role="treeitem"`, and do not convey selection state via `aria-selected`.
No `aria-live` regions exist to announce graph mutations, such as node addition, deletion, or connection creation.

#### Target remediation

Add standard ARIA labels, semantic roles, and explicit `aria-selected` status to all node and edge elements.
Introduce an accessible `aria-live="polite"` status log that announces selection changes and mutation results to assistive technologies.
Ensure color contrast ratio meets WCAG 2.1 AA standards for gray property badges and text labels (minimum 4.5:1).

### 3. Rendering performance and high-node-count scaling

#### Current state

`InteractiveGraphView` computes initial grid positions synchronously on every graph update using inline loop logic.
`GraphCanvas` creates new JavaScript `Map` instances on every render frame and relies on static pixel approximations (`256px × 100px`) for edge endpoint recalculation.
Rendering performance drops below 60 FPS when node count exceeds 150 nodes due to un-culled DOM nodes outside the current viewport.

#### Target remediation

Implement viewport culling or canvas offloading to maintain 60 FPS performance for graphs containing 500+ nodes.
Memoize node position maps and layout computations using `useMemo` and Web Worker offloading for complex force-directed layouts.
Optimize ReactFlow state updates to prevent full-graph re-renders on single-node attribute modifications.

## Prioritized remediation roadmap

1. **`canopy-gtv.2.1`**: Implement spatial keyboard navigation and focus management across graph nodes (`Tab`, `Arrows`, `Enter`, `Escape`).
2. **`canopy-gtv.2.2`**: Add WCAG 2.1 AA accessibility attributes, ARIA live region announcements, and color contrast enhancements.
3. **`canopy-gtv.2.3`**: Optimize rendering scalability and viewport culling for large graphs (500+ nodes at 60 FPS).
