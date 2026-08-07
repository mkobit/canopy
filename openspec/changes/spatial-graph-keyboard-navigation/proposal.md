## Why

Canopy's graph UI components (`InteractiveGraphView` and `GraphCanvas`) currently lack spatial keyboard navigation and focus management.
Users relying on keyboard or screen readers cannot focus nodes using `Tab`, navigate between visually adjacent nodes using arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`), or clear selection using `Escape`.
UX research audit [`docs/research/2026-07-31-ux-graph-audit.md`](file:///home/mkobit/workspace/mkobit/canopy/docs/research/2026-07-31-ux-graph-audit.md) identified `canopy-gtv.2.1` to remediate these keyboard spatial navigation and focus management gaps.

## What changes

- **Decoupled navigation hook**: Add `useSpatialGraphNavigation` in `apps/web/src/components/graph/use-spatial-graph-navigation.ts` implementing Euclidean distance-based directional arrow key navigation.
- **Node accessibility**: Add `tabIndex={0}` and Tailwind focus ring styling (`focus-visible:ring-2 focus-visible:ring-blue-500`) to `CustomNode` and `NodeView`.
- **Canvas event integration**: Wire `useSpatialGraphNavigation` to keydown event listeners on `InteractiveGraphView` and `GraphCanvas`.
- **Unit tests**: Add test coverage for directional spatial navigation, `Escape` key handling, empty graph guards, and input element isolation in `apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts`.

## Capabilities

### New capabilities

- `spatial-graph-keyboard-navigation`: Enables spatial arrow key navigation, `Tab` focus management, and `Escape` selection dismissal across graph views.

### Modified capabilities

<!-- None -->

## Impact

- `apps/web/src/components/graph/`: Adds `useSpatialGraphNavigation` hook and tests; updates `custom-node.tsx`, `node-view.tsx`, `interactive-graph-view.tsx`, and `graph-canvas.tsx`.
