# Design: rich-text block-editor state synchronization

## Decisions

### Text storage: separate `Y.Map<Y.Text>` inside `Y.Doc`

We will add a new top-level shared map called `texts` (`Y.Map<Y.Text>`) inside the Yjs document.
Each entry in this map uses the node's [NodeId](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/identifiers.ts) as the key, pointing to a collaborative `Y.Text` instance.

**Rationale:**
1. A `Y.Text` instance cannot be directly serialized or stored inside a standard `Y.Map` property value if we want to treat node properties as plain JSON-compatible scalars.
2. Isolating rich text documents in a dedicated `texts` map keeps the primary `nodes` map lightweight and fast to query.
3. This aligns with Yjs best practices for structuring complex documents.

**Alternative considered:** store text as serialized markdown strings inside the node properties map.
Rejected because concurrent character edits on a single string property would result in merge conflicts, duplicate text, or broken formatting tags.

---

### Text projection: bridge `Y.Text` to string properties

In the projection layer, when converting the Yjs store state to an immutable [Node](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/node.ts) object:
1. We read the corresponding `Y.Text` from the `texts` map using the node's ID.
2. We call `.toString()` on the `Y.Text` instance.
3. We set this string value as the `content` property of the projected node.

**Rationale:**
This maintains the invariant that [packages/graph](file:///home/mkobit/workspace/mkobit/canopy/packages/graph) is pure, functional, and completely free of Yjs dependencies.
The rest of the codebase (queries, rendering, settings) continues to see a standard node with immutable string properties.

---

### Undo/redo grouping: timed undo manager

We will instantiate a `Y.UndoManager` scoped to the `texts` map.
We configure it with a `captureTimeout` of 500 milliseconds.

**Rationale:**
1. Without a timeout, every individual keystroke creates a separate undo step, requiring users to press Undo dozens of times to revert a single word.
2. A 500ms timeout groups continuous typing into logical blocks.
3. This matches standard human expectations for text editing undo/redo behavior.

---

## Open questions

| # | Question | Trigger to revisit |
|---|----------|--------------------|
| 1 | Formatting tags (bold, italic, links) representation in `Y.Text` | When implementing the rich-text rendering component |
| 2 | Garbage collection of deleted node text content | When implementing the tombstone GC process |
