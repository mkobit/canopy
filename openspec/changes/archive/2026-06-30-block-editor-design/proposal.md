# Proposal: rich-text block-editor state synchronization

## Why

The current [BlockEditor](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/editor/block-editor.tsx) uses a basic HTML string-based `contentEditable` component.
This design has several major limitations for collaborative editing:
1. Direct editing of HTML strings leads to tag corruption and parsing errors when Yjs merges concurrent character insertions.
2. Character-by-character changes flood the global event log if captured as standard node update events.
3. User actions like undo and redo work at the raw character level rather than grouping edits into logical text segments.

## What changes

- Define how `Y.Text` instances are managed inside the [GraphStore](file:///home/mkobit/workspace/mkobit/canopy/packages/sync/src/store/graph-store.ts) document.
- Map the `content` property of text-based nodes (e.g., `TYPE_TEXT_BLOCK` or `TYPE_MARKDOWN`) to collaborative `Y.Text` instances.
- Establish a transaction and event grouping strategy for collaborative rich text.
- Formulate an undo/redo grouping manager for user text inputs.

## Capabilities

### Modified capabilities

- `block-editor-crdt`: The block editor synchronizes character modifications safely using `Y.Text`.
- `block-editor-undo`: Text edits are grouped by time or word boundaries to provide clean undo and redo history.

## Impact

- `packages/sync/src/store/graph-store.ts` — extend Yjs schema to associate nodes with `Y.Text` instances.
- `apps/web/src/components/editor/block-editor.tsx` — rewrite editor to bind to Yjs provider/document rather than parent string property.
