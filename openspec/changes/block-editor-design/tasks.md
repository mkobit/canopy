## 1. Extend Yjs schema in sync store

- [ ] 1.1 Add `texts: Y.Map<Y.Text>` to the [GraphStore](file:///home/mkobit/workspace/mkobit/canopy/packages/sync/src/store/graph-store.ts) interface and initialization in `createGraphStore`.
- [ ] 1.2 Update [converters.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/sync/src/store/converters.ts) to read from `texts` and project it as the `content` property of the node.
- [ ] 1.3 Update the add and update node operations in [packages/sync/src/store/ops/node.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/sync/src/store/ops/node.ts) to write text values to the `texts` map.

## 2. Configure undo/redo manager

- [ ] 2.1 Instantiate `Y.UndoManager` targeting the `texts` map in [sync-engine.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/sync/src/sync-engine.ts).
- [ ] 2.2 Configure the undo manager with a `captureTimeout` of 500 milliseconds.

## 3. Rewrite block editor component

- [ ] 3.1 Modify [block-editor.tsx](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/editor/block-editor.tsx) to accept a `Y.Text` instance.
- [ ] 3.2 Bind the editor's text content and formatting commands directly to the `Y.Text` instance using Yjs events.

## 4. Verify

- [ ] 4.1 Run all tests (`bun test`).
- [ ] 4.2 Run linter and typechecker (`bun run lint && bun run typecheck`).
