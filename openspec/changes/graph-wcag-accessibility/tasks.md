# Tasks: Graph WCAG 2.1 AA accessibility & ARIA live region announcements (`canopy-gtv.2.2`)

- [ ] 1. Create `AriaLiveRegion` component and `useAriaLiveAnnouncer` hook in `apps/web/src/components/graph/aria-live-region.tsx`. <!-- id: 1 -->
- [ ] 2. Update `CustomNode` and `NodeView` with `role="button"`, `aria-selected`, dynamic `aria-label`, and WCAG 2.1 AA high-contrast badge colors. <!-- id: 2 -->
- [ ] 3. Update `InteractiveGraphView` and `GraphCanvas` containers with `role="region"`, `aria-label`, and wire `AriaLiveRegion` announcements on selection & graph mutations. <!-- id: 3 -->
- [ ] 4. Add unit tests for accessibility roles, ARIA attributes, live announcements, and contrast badges in `apps/web/src/components/graph/__tests__/graph-accessibility.test.ts`. <!-- id: 4 -->
- [ ] 5. Run quality gates (`bun run build && bun run lint && bun run typecheck && bun test`). <!-- id: 5 -->
