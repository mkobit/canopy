# Content model

> Status: **draft**
> Scope: block types, containment, ordering, document-as-view, inline query syntax
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md)

---

## 1. Principles

Content is modeled as nodes and edges, not documents and paragraphs.
There is no document type.
A "document" is what a renderer produces when it traverses a subgraph.

The data model does not know about formatting.
Bold, italic, headings, and other presentation concerns are the renderer's responsibility.
The data layer stores text; the view layer interprets it.

The system is expected to contain many nodes and many edges.
This is normal and by design.
Indexing and query performance are first-order concerns.

---

## 2. Block types

Blocks are nodes with system-defined types from layer 2.
Each block type carries a simple set of properties.

### TextBlock

A plain text block.
The renderer decides how to display it (paragraph, heading, list item, etc.).

| Property | Type   | Required | Description                   |
| -------- | ------ | -------- | ----------------------------- |
| `text`   | string | yes      | The text content of the block |

### CodeBlock

A block of source code or preformatted text.

| Property   | Type   | Required | Description                                 |
| ---------- | ------ | -------- | ------------------------------------------- |
| `text`     | string | yes      | The code content                            |
| `language` | string | no       | Language identifier for syntax highlighting |

### MarkdownNode

A block whose content is interpreted as markdown by its renderer.

| Property  | Type   | Required | Description       |
| --------- | ------ | -------- | ----------------- |
| `content` | string | yes      | Raw markdown text |

The markdown renderer is responsible for interpreting the content.
This includes standard markdown syntax (bold, italic, headings, lists, tables) and system-specific extensions like inline query syntax.

MarkdownNode is the expected first-class authoring experience for most users.
It offers the richest rendering without requiring multiple block nodes for simple formatted text.

### Property naming convention

TextBlock and CodeBlock use `text` for their content property because their content is plain text with no special interpretation at the data layer.
MarkdownNode uses `content` because its value is interpreted by the renderer as markdown.
This distinction is intentional: `text` means literal text, `content` means text with semantic structure that a renderer will parse.

### Common node properties

All nodes carry temporal metadata from the core data model (created, modified).
These are inherent to every node, not specific to block types.

> **Open question**: whether to enforce additional system properties on block types (e.g., an explicit `title` property) or keep blocks minimal is TBD.
> The current leaning is minimal: let the renderer and view layer handle presentation concerns.

---

## 3. Containment

Blocks relate to each other through `child_of` edges.
A block is a child of another block (or a root node) via a directed edge.

```
[child block] --child_of--> [parent block]
```

There are no special container types.
Any node can be a parent if another node has a `child_of` edge pointing to it.

A root node is simply a node with no outgoing `child_of` edges (it is not a child of anything).
It serves as the entry point for a document-like view.
It is a regular node, not a special type.

> **Open question**: whether root nodes are identified purely by topology (no outgoing `child_of` edges) or by some other mechanism (a specific edge type, a query, a user-pinned reference) is TBD.
> Topological identification is the simplest approach and the current default.

---

## 4. Ordering

Child blocks under a parent are ordered by a `position` property on the `child_of` edge.

Position values use **fractional indexing**: string keys that sort lexicographically.
This is CRDT-friendly because two devices can independently insert between the same two siblings without conflict.
Each device generates a different fractional key, and both sort correctly relative to the neighbors.

Fractional indexing properties:

- Keys are arbitrary-precision strings (not integers).
- Inserting between positions `a` and `b` produces a new position `c` where `a < c < b` lexicographically.
- No rebalancing is needed under normal operation.
- Position exhaustion (inserting repeatedly at the same spot) is a theoretical concern handled by key generation algorithms.

The `child_of` edge carries:

| Property   | Type   | Required | Description                            |
| ---------- | ------ | -------- | -------------------------------------- |
| `position` | string | yes      | Fractional index key for sort ordering |

---

## 5. References between content

References between nodes are **edges**, not embedded syntax.

If a note references a concept, that relationship is an edge in the graph.
There is no wikilink syntax (`[[node:uuid]]` or similar) at the data layer.
This keeps references queryable, traversable, and first-class.

The graph is the reference system.
Inline link syntax in text would duplicate information that already exists as edges, and would diverge from the graph-native model.

> **Implication**: creating a reference from one piece of content to another is a two-step operation at the data layer: the user indicates a reference, and the system creates an edge.
> How this surfaces in the UI (autocomplete, drag-and-drop, slash commands) is a view/interaction concern, not a data model concern.

---

## 6. Queries as nodes

A query is a node with a system-defined Query type.
It stores the query definition as properties.
Queries are first-class content in the graph, not embedded strings.

One or more **view definitions** can be attached to a query node via edges.
These determine how the query's results are rendered (table, list, card grid, etc.).
A query node without an attached view uses a default system view.

### Inline syntax and linking (deferred)

Inline syntax for referencing queries or other nodes within markdown content is not designed yet.
The core data model and execution model take priority.

Potential future directions include a fenced code block syntax for embedded query results and a protocol scheme (e.g., `canopy://`) for intra-graph linking.
These are acknowledged but explicitly deferred.
Markdown's lack of a true standard makes this a design minefield that should not be entered prematurely.

---

## 7. Scale and indexing

The content model produces many nodes and edges by design.
A single "document" with 50 paragraphs is 50+ nodes and 50+ edges.
A vault with thousands of documents may contain hundreds of thousands of nodes.

This is expected and correct.
The tradeoff is: richer queryability and graph-native relationships at the cost of higher node counts.

Performance depends on:

- **Indexing strategy** for the materialized graph view (covered in the query engine design doc).
- **Efficient traversal** of `child_of` edges for rendering (the most common query pattern).
- **Projection performance** as the event log grows (snapshotting mitigates this).

The content model does not constrain scale.
It is the query and storage layers' responsibility to handle it.

---

## 8. What the content model does not cover

These are explicitly out of scope for this document:

| Concern                                                   | Where it belongs                                                             |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| How blocks are rendered                                   | [View and renderer system](2026-02-08-view-and-renderer-system.md)           |
| How queries work                                          | [Query engine](2026-02-08-query-engine.md)                                   |
| How text is collaboratively edited (character-level CRDT) | Not a current goal; see [sync](2026-02-08-sync.md)                           |
| How blocks are created/edited in the UI                   | UI/interaction design                                                        |
| How references surface to the user                        | UI/interaction design                                                        |
| Pluggable renderers, custom hooks, workflow actions       | [Extension and execution model](2026-02-08-extension-and-execution-model.md) |
| WASM sandboxing, permission model, execution runtime      | [Extension and execution model](2026-02-08-extension-and-execution-model.md) |

---

## 9. Open questions

1. Root node identification: topological (no outgoing `child_of`) vs explicit marker vs query-based.
2. Additional system properties on blocks: minimal (just `text`/`content`) vs enforced metadata.
3. Whether TextBlock should carry a `role` or `level` property (e.g., heading level) or whether that is purely a renderer/view concern.
4. Maximum practical depth for nested `child_of` hierarchies and whether to set a configurable limit.
5. Inline syntax for embedding query results or linking to nodes within markdown content (deferred).
6. Intra-graph linking protocol scheme (deferred).
7. How query node view attachments interact with the view resolution chain (see [view and renderer system](2026-02-08-view-and-renderer-system.md)).
