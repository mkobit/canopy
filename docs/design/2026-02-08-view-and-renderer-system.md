# View and renderer system

> Status: **draft**
> Scope: view definitions, renderer nodes, resolution chain, renderer API surface, output model
> Depends on: [2026-02-06-core-data-model.md](2026-02-06-core-data-model.md), [2026-02-06-content-model.md](2026-02-06-content-model.md)

---

## 1. Principles

Rendering is not a property of a node.
A node does not know how it should be displayed.
Rendering is determined by resolving a view definition and invoking a renderer.

View definitions and renderer references are stored in the graph as system node types.
The actual rendering logic ships with the application (system renderers) or as sandboxed extensions (future WASM renderers).

The same node can be rendered differently depending on context, user preferences, or application version.

---

## 2. Core concepts

### View definition

A ViewDefinition is a system node type stored in the graph.
It expresses a binding: "for nodes matching these criteria, use this renderer."

Matching criteria can be:

- **Type-based**: all nodes of a given type (e.g., all TextBlock nodes).
- **Query-based**: nodes matching a graph query.
- **Node-specific**: a particular node, via a direct edge from the node to the ViewDefinition.

A ViewDefinition references a Renderer node.
It may also carry properties that configure the renderer (layout options, display preferences, etc.).

### Renderer

A Renderer is a system node type stored in the graph.
It identifies a rendering implementation and describes its capabilities.

The Renderer node stores metadata: name, supported output format, version, and any configuration schema.
The actual rendering code lives outside the graph:

- **System renderers** ship with the application binary.
- **Custom renderers** will eventually run as sandboxed WASM modules (see section 7).

Both system and custom renderers use the same API surface.

### Relationship between views and renderers

A ViewDefinition references a Renderer and optionally adds configuration.
Multiple ViewDefinitions can reference the same Renderer with different configuration.

```
[ViewDefinition] --uses_renderer--> [Renderer]
[Node] --view_override--> [ViewDefinition]  (optional, node-specific)
```

---

## 3. Renderer versioning

The graph stores _which_ renderer to use, not _how_ it renders.
Rendering behavior is determined by the application version.

App v1 may render a TextBlock as a plain paragraph.
App v2 may render the same TextBlock with new features (inline formatting, accessibility improvements, etc.).
The graph data does not change; the rendering implementation evolves with the app.

This means:

- Renderer nodes in the graph are stable references, not versioned per app release.
- The application is responsible for mapping a Renderer node to its current implementation.
- If a renderer implementation changes in a breaking way, a new Renderer node can be created via migration events (see core data model, section 4).

---

## 4. View resolution

When the system needs to render a node, it resolves which ViewDefinition and Renderer to use.

Resolution checks multiple sources and coalesces the result:

1. **Node-specific override**: check if the node has a direct edge to a ViewDefinition.
2. **User settings**: query user settings for view preferences applicable to this node's type or context.
3. **System default**: fall back to the system ViewDefinition for this node type (created during bootstrap).

The first source that provides a ViewDefinition wins for the base selection.
Settings may be granular, allowing partial overrides (e.g., user overrides display density but inherits the renderer from the system default).

> **Open question**: exact coalescing behavior for partial overrides is TBD.
> The simplest model is "first complete ViewDefinition wins."
> A richer model allows merging configuration properties across resolution levels.

### User settings

User view preferences may live in a separate settings scope or subgraph.
The resolution process queries this scope as part of the chain.

How user settings are stored and queried is covered in a future settings design doc.
For this document, the relevant point is: user settings are a source in the resolution chain, checked between node-specific overrides and system defaults.

---

## 5. Recursive rendering

Renderers are recursive.
A renderer for a parent node can query for child nodes (via `child_of` edges) and invoke rendering for each child.

The "document view" is an emergent result: a root node's renderer queries children, each child's renderer queries its children, and so on down the tree.
There is no special document rendering mode; it is just recursive renderer invocation.

> **Open question**: maximum recursion depth.
> A configurable limit (default 5 or similar) prevents runaway rendering in deeply nested or cyclic subgraphs.

---

## 6. Renderer API

The renderer API is the contract between the system and any renderer (system or custom).

### Input

The renderer receives:

- The **node** being rendered, including its properties.
- A **graph access API** for traversing edges (inbound and outbound), resolving references, and running queries.
- **Configuration** from the ViewDefinition (display preferences, layout options).
- **Context** (parent renderer, depth, user settings, etc.).

### Output

The renderer returns **HTML**.
HTML is the output format for cross-platform compatibility (web, desktop via Electron-style apps, mobile webviews).

> **Open question**: whether to support additional output formats (plain text, JSON for API consumers) or keep HTML as the sole target.
> HTML-only is the simplest starting point.

### Security and sandboxing

All graph access from the renderer goes through a permission-checked, sandboxed execution boundary.
A renderer cannot access arbitrary system state; it can only use the APIs provided to it.

System renderers and custom WASM renderers use the same API surface.
This ensures that system renderers don't depend on privileged access that custom renderers can't replicate.

The execution model, sandbox implementation, and permission system are out of scope for this document.
They are covered in the extension and execution model design doc (future).

---

## 7. Custom renderers (future)

Custom renderers are WASM modules that implement the renderer API.
They are referenced by Renderer nodes in the graph.
They run in a sandboxed environment with permission-controlled access to graph APIs.

This enables:

- User-authored rendering logic in any language that compiles to WASM.
- Third-party renderer plugins distributed as WASM modules.
- Domain-specific visualizations (charts, diagrams, specialized editors).

Custom renderers are explicitly deferred.
The system will ship with system renderers only.
The renderer API is designed with this extension point in mind, but WASM execution support is not in scope for initial implementation.

---

## 8. System renderers (bootstrap)

The following system renderers are created during bootstrap:

| Renderer          | Target type  | Description                                             |
| ----------------- | ------------ | ------------------------------------------------------- |
| Text renderer     | TextBlock    | Renders plain text content                              |
| Code renderer     | CodeBlock    | Renders code with optional syntax highlighting          |
| Markdown renderer | MarkdownNode | Interprets markdown syntax and renders formatted output |

Each has a corresponding default ViewDefinition binding the renderer to its target type.
These are the minimum viable set for the content model.

Additional system renderers (for Query result views, settings panels, graph visualizations, etc.) will be added as those subsystems are designed.

---

## 9. Query node views

Query nodes (see content model, section 6) can have ViewDefinition nodes attached via edges.
These determine how query results are rendered.

A Query node without an attached ViewDefinition uses a default system view for query results.
The default might render results as a simple list or table.

Custom views on query nodes enable:

- Tables with specific columns and sorting.
- Card grids or kanban-style layouts.
- Charts or aggregation views.
- Any renderer that can accept a query result set as input.

The renderer API for query views receives the query result set (a collection of nodes/edges) rather than a single node.
This is a variant of the standard renderer input.

---

## 10. What this document does not cover

| Concern                                           | Where it belongs              |
| ------------------------------------------------- | ----------------------------- |
| WASM execution runtime and sandboxing             | Extension and execution model |
| Permission model for renderer graph access        | Extension and execution model |
| User settings storage and query                   | Settings design doc           |
| Inline query syntax in markdown                   | Content model / query engine  |
| UI interaction patterns (editor chrome, toolbars) | UI/interaction design         |

---

## 11. Open questions

1. Coalescing behavior for partial view overrides across resolution levels.
2. Maximum recursion depth for nested rendering and whether it is configurable per view.
3. Whether to support output formats beyond HTML.
4. How the application maps Renderer node IDs to their runtime implementations.
5. Whether ViewDefinition configuration properties have a schema or are free-form.
6. How query result views differ from single-node views at the API level.
7. Whether renderer hot-reload (updating a renderer without restarting the app) is a goal.
