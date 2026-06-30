## 1. Integrate BlockEditor in NodePage

- [x] 1.1 Import `BlockEditor` component in [NodePage](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/pages/node-page.tsx).
- [x] 1.2 Extract the `Y.Text` instance using `useMemo` from `syncEngine.store.texts` for the current `nodeId`.
- [x] 1.3 Exclude `'content'` from the `editedProps` rendering loop in the edit panel.
- [x] 1.4 Render the collaborative `BlockEditor` component in the main content container of the page if the node supports a string `content` property.

## 2. Verify

- [x] 2.1 Verify node page builds and typechecks cleanly using `bun run build`.
- [x] 2.2 Verify that end-to-end tests continue to pass using `bun run test:e2e`.
