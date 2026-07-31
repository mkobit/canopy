# Spatial Graph Keyboard Navigation & Focus Management (`canopy-gtv.2.1`)

This design specification details spatial keyboard navigation, focus management (`tabIndex={0}`), and `Escape` key dismissal for graph nodes across `InteractiveGraphView` and `GraphCanvas`.

## Context

Graph visualization components in Canopy currently lack spatial keyboard navigation.
Users relying on keyboards or assistive tech cannot navigate between adjacent nodes using directional arrow keys (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`), nor clear node selection via `Escape`.

UX Research audit [`docs/research/2026-07-31-ux-graph-audit.md`](file:///home/mkobit/workspace/mkobit/canopy/docs/research/2026-07-31-ux-graph-audit.md) identified `canopy-gtv.2.1` as the P2 task to implement spatial focus management.

## Goals & Acceptance Criteria

- **Tab Navigation**: Graph nodes are focusable via `Tab` / `Shift+Tab` with `tabIndex={0}` and a visible focus ring (`focus-visible:ring-2 focus-visible:ring-blue-500`).
- **Spatial Arrow Navigation**: Pressing `ArrowUp`, `ArrowDown`, `ArrowLeft`, or `ArrowRight` moves focus to the visually nearest node in that spatial direction.
- **Selection Clearing**: Pressing `Escape` deselects the active node.
- **Reversibility & Modular Design**: Logic is encapsulated in a pure hook `useSpatialGraphNavigation` so it can be maintained, tested, or swapped independently.

## Proposed Architecture

### 1. `useSpatialGraphNavigation` Hook

Located at [`apps/web/src/components/graph/use-spatial-graph-navigation.ts`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/use-spatial-graph-navigation.ts).

```ts
export interface NavigationNode {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
}

export interface SpatialNavigationProperties {
  readonly nodes: readonly NavigationNode[];
  readonly selectedNodeId?: string | undefined;
  readonly onSelectNode: (nodeId: string | undefined) => void;
}

export function useSpatialGraphNavigation({
  nodes,
  selectedNodeId,
  onSelectNode,
}: SpatialNavigationProperties): {
  readonly handleKeyDown: (event: React.KeyboardEvent) => void;
}
```

### 2. Spatial Direction Algorithm

Given the active node $A = (x_A, y_A)$ and pressed arrow key direction vector $V$:
- `ArrowRight`: $V = (1, 0)$
- `ArrowLeft`: $V = (-1, 0)$
- `ArrowDown`: $V = (0, 1)$
- `ArrowUp`: $V = (0, -1)$

For each candidate node $B = (x_B, y_B)$ where $B.id \neq A.id$:
1. Calculate candidate vector $D = (x_B - x_A, y_B - y_A)$.
2. Calculate dot product $P = D \cdot V$.
3. If $P \le 0$ (node is behind or perpendicular), skip candidate.
4. Calculate Euclidean distance $dist = \sqrt{(x_B - x_A)^2 + (y_B - y_A)^2}$.
5. Select candidate $B$ that minimizes $dist$.

If no current node is selected, arrow key navigation defaults to selecting the first node in `nodes`.

### 3. Component Updates

- **[`custom-node.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/custom-node.tsx)** & **[`node-view.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/node-view.tsx)**:
  - Add `tabIndex={0}` to the outer card element.
  - Add Tailwind CSS focus styles: `focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none`.

- **[`interactive-graph-view.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/interactive-graph-view.tsx)** & **[`graph-canvas.tsx`](file:///home/mkobit/workspace/mkobit/canopy/apps/web/src/components/graph/graph-canvas.tsx)**:
  - Integrate `useSpatialGraphNavigation` and attach `handleKeyDown` to wrapper container `onKeyDown`.

## Adversarial Review and Mitigations

| Risk / Failure Mode | Impact | Mitigation |
| :--- | :--- | :--- |
| **Performance Overhead**: $O(N)$ spatial distance scan on every keydown frame for large graphs. | Keypress lag on graphs with >1000 nodes. | Early exit on non-navigation keys (`Tab`, `Escape` skip spatial scan). $O(N)$ distance scan is $<1\text{ms}$ for $N \le 1000$. |
| **Empty or Single Node Graph**: Keypress causes exception or null dereference. | UI runtime crash. | Guard against `nodes.length === 0`. If $N=1$, navigation is a safe no-op. |
| **No Candidate in Quadrant**: Pressing `ArrowRight` when no node exists to the right. | Focus lost or undefined behavior. | Retain current selection and focus if candidate set is empty. |
| **Component Compatibility**: ReactFlow node event propagation conflicts with container `onKeyDown`. | Keydown fires twice or is blocked by input elements. | Check `event.defaultPrevented` and ignore events originating from editable input fields (`input`, `textarea`). |

## Verification Plan

### Automated Verification
1. Unit test `useSpatialGraphNavigation` in `apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts`.
2. Run project quality gates:
   - `bun run build`
   - `bun run lint`
   - `bun run typecheck`
   - `bun test`
