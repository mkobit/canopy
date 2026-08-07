# Design: Spatial graph keyboard navigation & focus management (`canopy-gtv.2.1`)

## Context

Bead `canopy-gtv.2.1`.
This design document details the spatial keyboard navigation, focus management (`tabIndex={0}`), and `Escape` key dismissal for graph nodes across `InteractiveGraphView` and `GraphCanvas`.

## Goals & non-goals

### Goals

- Provide standard keyboard focus (`tabIndex={0}`) and visible focus rings (`focus-visible:ring-2 focus-visible:ring-blue-500`) on `CustomNode` and `NodeView`.
- Enable directional spatial arrow navigation (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`) to jump focus to the visually closest neighbor node.
- Enable `Escape` key handling to deselect the active node.
- Implement logic in a pure, decoupled custom hook `useSpatialGraphNavigation` to ensure high testability, modularity, and easy reversibility.

### Non-goals

- ARIA live region announcements and screen reader live updates (tracked in `canopy-gtv.2.2`).
- Viewport culling and 500+ node canvas optimization (tracked in `canopy-gtv.2.3`).

## Decisions

### Decision 1: Euclidean Spatial Distance Metric

We choose Euclidean directional spatial proximity over pure topological edge traversal for arrow key navigation.
When an arrow key is pressed, the hook computes directional vectors ($V$), filters nodes in the directional hemisphere ($D \cdot V > 0$), and selects the candidate minimizing Euclidean distance $\sqrt{\Delta x^2 + \Delta y^2}$.
This ensures intuitive directional navigation across both connected and disconnected node layouts.

### Decision 2: Decoupled Custom Hook (`useSpatialGraphNavigation`)

We encapsulate spatial navigation state and keyboard event handling inside `apps/web/src/components/graph/use-spatial-graph-navigation.ts`.
Both `InteractiveGraphView` (ReactFlow canvas) and `GraphCanvas` (SVG/HTML canvas) invoke this hook, avoiding code duplication and keeping graph visual engines cleanly decoupled from navigation logic.

## Technical implementation details

### Hook API (`useSpatialGraphNavigation.ts`)

```ts
export interface NavigationNode {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
}

export interface SpatialNavigationOptions {
  readonly nodes: readonly NavigationNode[];
  readonly selectedNodeId?: string | undefined;
  readonly onSelectNode: (nodeId: string | undefined) => void;
}

export function useSpatialGraphNavigation({
  nodes,
  selectedNodeId,
  onSelectNode,
}: SpatialNavigationOptions): {
  readonly handleKeyDown: (event: React.KeyboardEvent) => void;
};
```

### Component Focusability

- `CustomNode` and `NodeView` add `tabIndex={0}` and Tailwind focus classes (`focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none`).
- When a node is selected via keyboard arrow or mouse click, focus is programmatically synchronized to `[data-node-id="..."]` DOM elements.

## Adversarial review and mitigations

### 1. Resource and performance overhead

- **Risk**: Calculating candidate distance vectors on keydown could degrade performance on large graphs with 1,000+ nodes.
- **Mitigation**:
  - Filter key events immediately: if key is not an arrow key or `Escape`, return early.
  - Exclude input target elements (`input`, `textarea`, `contenteditable`) to prevent capturing typing inside dialogs or prompts.
  - Spatial distance calculation for $N=1,000$ takes $<1\text{ms}$ in standard JavaScript engines.

### 2. Failure modes and edge cases

- **Risk 1**: Empty graph ($N=0$) or single node graph ($N=1$) crashes when accessing candidate arrays.
- **Mitigation**: Add explicit guards for `nodes.length === 0` and return no-op when $N \le 1$.
- **Risk 2**: No node exists in target directional cone (e.g. `ArrowRight` pressed at rightmost boundary node).
- **Mitigation**: When candidate set is empty, retain current node selection and focus without throwing or changing selection.
- **Risk 3**: `Escape` key deselects node while user is inside a prompt modal.
- **Mitigation**: Check `event.defaultPrevented` and stop propagation only when handling unhandled graph container keydown events.

### 3. Security and isolation

- **Risk**: Event listener leaks or global keydown capture hijacking standard input controls.
- **Mitigation**: Scope keydown listeners strictly to React container element `onKeyDown` handlers rather than global `window.addEventListener`, preventing leakage outside graph views.

### 4. Migration and backward compatibility risks

- **Risk**: Modifying node components breaks existing mouse click / selection handlers.
- **Mitigation**: `useSpatialGraphNavigation` is purely additive. All existing `onClick` and `onNodeClick` props remain unmodified.
