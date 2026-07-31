## Why

Canopy's graph UI components (`InteractiveGraphView`, `GraphCanvas`, `CustomNode`, `NodeView`) currently lack proper WCAG 2.1 AA accessibility attributes, screen reader live region announcements, and sufficient text contrast ratios.
Screen reader users cannot identify focused graph nodes, discern selection state, or receive auditory announcements when graph nodes or edges are selected, created, or modified.
Furthermore, low-contrast text colors (`text-gray-400`, `text-gray-300`) on node ID and type badges fail WCAG 2.1 AA 4.5:1 contrast requirements.
UX research audit bead `canopy-gtv.2.2` requires adding WCAG 2.1 AA attributes, ARIA live region announcements, and high-contrast color badges across graph views.

## What changes

- **ARIA roles and labels**:
  - Add `role="region"` and `aria-label="Graph canvas"` / `aria-label="Interactive graph visualization"` to graph container elements (`InteractiveGraphView`, `GraphCanvas`).
  - Add `role="button"`, `aria-selected={selected}`, and structured `aria-label` (e.g. `Node [Type]: [Name] (ID: [id])`) to `CustomNode` and `NodeView`.
- **ARIA live region announcements**:
  - Add `AriaLiveRegion` component / `useAriaLiveAnnouncer` hook providing a polite `aria-live="polite"` live region for selection and graph mutation announcements.
  - Announce node selection (e.g. "Selected node [Name] of type [Type]") and graph mutation events (e.g. "Node created", "Edge created").
- **WCAG 2.1 AA high-contrast styling**:
  - Update node badge colors (`text-gray-400` -> `text-slate-600`, `text-gray-600` -> `text-slate-800`, `bg-gray-100` -> `bg-slate-100 border border-slate-200`) to guarantee >= 4.5:1 contrast ratio against white/light backgrounds.
- **Unit testing & verification**:
  - Add comprehensive test coverage in `apps/web/src/components/graph/__tests__/graph-accessibility.test.ts` for ARIA attributes, selection states, live announcements, and contrast badges.

## Capabilities

### New capabilities

- `graph-wcag-accessibility`: Provides WCAG 2.1 AA compliant ARIA attributes, live region announcements, and high-contrast visual badges for graph views.

### Modified capabilities

<!-- None -->

## Impact

- `apps/web/src/components/graph/`: Updates `custom-node.tsx`, `node-view.tsx`, `interactive-graph-view.tsx`, `graph-canvas.tsx`, and adds `aria-live-region.tsx` / tests.
