# Spatial Graph Keyboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spatial directional keyboard navigation (`ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`), focusability (`tabIndex={0}`), and `Escape` selection dismissal across `InteractiveGraphView` and `GraphCanvas`.

**Architecture:** Create a decoupled, pure React hook `useSpatialGraphNavigation` that computes directional Euclidean proximity vectors to select the visually closest neighbor node. Wire the hook to ReactFlow and SVG graph canvas views, and apply accessible focus ring styles to node cards.

**Tech Stack:** React 19, TypeScript (strict immutability `readonly`), Tailwind CSS v4, Bun Test, `@xyflow/react`.

## Global Constraints

- All domain and UI hook interface properties MUST be `readonly`.
- No raw `any` types.
- Strict TDD for hook logic: write failing test, verify failure, implement code, verify pass.
- No breaking changes to existing `onNodeClick` mouse handlers.

---

### Task 1: Create `useSpatialGraphNavigation` Hook with TDD Unit Tests

**Files:**

- Create: `apps/web/src/components/graph/use-spatial-graph-navigation.ts`
- Create: `apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts`

**Interfaces:**

- Consumes: `@canopy/graph` types, React keydown events
- Produces: `useSpatialGraphNavigation({ nodes, selectedNodeId, onSelectNode })` returning `{ handleKeyDown }`

- [ ] **Step 1: Write failing unit test for `useSpatialGraphNavigation`**

Create `apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test';
import { renderHook } from '@testing-library/react';
import { useSpatialGraphNavigation } from '../use-spatial-graph-navigation';
import type { ReactKeyboardEvent } from '../use-spatial-graph-navigation';

describe('useSpatialGraphNavigation', () => {
  const nodes = [
    { id: 'node-1', position: { x: 100, y: 100 } },
    { id: 'node-2', position: { x: 300, y: 100 } },
    { id: 'node-3', position: { x: 100, y: 300 } },
  ];

  it('navigates right with ArrowRight key', () => {
    const onSelectNode = mock();
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'node-1',
        onSelectNode,
      }),
    );

    const event = {
      key: 'ArrowRight',
      preventDefault: mock(),
      defaultPrevented: false,
      target: document.createElement('div'),
    } as unknown as ReactKeyboardEvent;

    result.current.handleKeyDown(event);
    expect(onSelectNode).toHaveBeenCalledWith('node-2');
  });

  it('clears selection on Escape key', () => {
    const onSelectNode = mock();
    const { result } = renderHook(() =>
      useSpatialGraphNavigation({
        nodes,
        selectedNodeId: 'node-1',
        onSelectNode,
      }),
    );

    const event = {
      key: 'Escape',
      preventDefault: mock(),
      defaultPrevented: false,
      target: document.createElement('div'),
    } as unknown as ReactKeyboardEvent;

    result.current.handleKeyDown(event);
    expect(onSelectNode).toHaveBeenCalledWith(undefined);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts`
Expected: FAIL with missing module error `cannot find module '../use-spatial-graph-navigation'`.

- [ ] **Step 3: Implement `useSpatialGraphNavigation` hook**

Create `apps/web/src/components/graph/use-spatial-graph-navigation.ts`:

```ts
import React, { useCallback } from 'react';

export interface NavigationNode {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number };
}

export interface SpatialNavigationOptions {
  readonly nodes: readonly NavigationNode[];
  readonly selectedNodeId?: string | undefined;
  readonly onSelectNode: (nodeId: string | undefined) => void;
}

export type ReactKeyboardEvent = React.KeyboardEvent<HTMLElement>;

function isInputElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tagName = element.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || element.isContentEditable;
}

// eslint-disable-next-line max-lines-per-function
export function useSpatialGraphNavigation({
  nodes,
  selectedNodeId,
  onSelectNode,
}: SpatialNavigationOptions): {
  readonly handleKeyDown: (event: ReactKeyboardEvent) => void;
} {
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      if (event.defaultPrevented || isInputElement(event.target)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onSelectNode(undefined);
        return;
      }

      const directionVectors: Record<string, { readonly x: number; readonly y: number }> = {
        ArrowUp: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
      };

      const vector = directionVectors[event.key];
      if (!vector || nodes.length === 0) return;

      event.preventDefault();

      const currentNode = nodes.find((n) => n.id === selectedNodeId) ?? nodes[0];
      if (!currentNode) return;

      if (!selectedNodeId) {
        onSelectNode(currentNode.id);
        return;
      }

      // Filter candidates in directional hemisphere (dot product > 0)
      const candidates = nodes
        .filter((n) => n.id !== currentNode.id)
        .map((n) => {
          const dx = n.position.x - currentNode.position.x;
          const dy = n.position.y - currentNode.position.y;
          const dot = dx * vector.x + dy * vector.y;
          const distSq = dx * dx + dy * dy;
          return { id: n.id, dot, distSq };
        })
        .filter((c) => c.dot > 0);

      if (candidates.length === 0) return;

      // Pick candidate minimizing Euclidean distance
      candidates.sort((a, b) => a.distSq - b.distSq);
      const nextNode = candidates[0];
      if (nextNode) {
        onSelectNode(nextNode.id);
      }
    },
    [nodes, selectedNodeId, onSelectNode],
  );

  return { handleKeyDown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts`
Expected: PASS cleanly.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/web/src/components/graph/use-spatial-graph-navigation.ts apps/web/src/components/graph/__tests__/use-spatial-graph-navigation.test.ts
git commit -m "feat(web): add useSpatialGraphNavigation hook with unit tests (canopy-gtv.2.1)"
```

---

### Task 2: Update Node Focusability & Canvas Keydown Wiring

**Files:**

- Modify: `apps/web/src/components/graph/custom-node.tsx`
- Modify: `apps/web/src/components/graph/node-view.tsx`
- Modify: `apps/web/src/components/graph/interactive-graph-view.tsx`
- Modify: `apps/web/src/components/graph/graph-canvas.tsx`

**Interfaces:**

- Consumes: `useSpatialGraphNavigation`
- Produces: Focusable graph node views with keyboard spatial navigation support

- [ ] **Step 1: Add focus ring and tabIndex to `CustomNode` and `NodeView`**

Update `apps/web/src/components/graph/custom-node.tsx`:
Add `tabIndex={0}` and `focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none` to outer `div`. Add `data-node-id={node.id}` attribute.

Update `apps/web/src/components/graph/node-view.tsx`:
Add `tabIndex={0}` and `focus-visible:ring-2 focus-visible:ring-blue-500 focus:outline-none` to outer `div`.

- [ ] **Step 2: Wire `useSpatialGraphNavigation` in `InteractiveGraphView` & `GraphCanvas`**

Update `apps/web/src/components/graph/interactive-graph-view.tsx`:

- Track selected node ID state `[selectedNodeId, setSelectedNodeId] = React.useState<string | undefined>(undefined);`
- Invoke `useSpatialGraphNavigation({ nodes, selectedNodeId, onSelectNode: setSelectedNodeId })`.
- Pass `onKeyDown={handleKeyDown}` and `tabIndex={0}` to wrapper `div`.

Update `apps/web/src/components/graph/graph-canvas.tsx`:

- Receive optional `selectedNodeId` or infer from `selectedNodeIds`.
- Invoke `useSpatialGraphNavigation`.
- Pass `onKeyDown={handleKeyDown}` and `tabIndex={0}` to wrapper `div`.

- [ ] **Step 3: Run full quality gates to verify clean build and passing tests**

Run: `bun run build && bun run lint && bun run typecheck && bun test`
Expected: Clean build, 0 lint/type errors, all tests passing.

- [ ] **Step 4: Commit Task 2**

```bash
git add apps/web/src/components/graph/
git commit -m "feat(web): wire spatial graph keyboard navigation across canvas components (canopy-gtv.2.1)"
```

---

### Task 3: Quality Gates, OpenSpec & Bead Verification

**Files:**

- Modify: `openspec/changes/spatial-graph-keyboard-navigation/tasks.md`

- [ ] **Step 1: Mark OpenSpec tasks complete**

Update `openspec/changes/spatial-graph-keyboard-navigation/tasks.md` to set all tasks complete `[x]`.

- [ ] **Step 2: Run quality gates**

Run: `bun run build && bun run lint && bun run typecheck && bun test`

- [ ] **Step 3: Commit final task verification**

```bash
git add openspec/changes/spatial-graph-keyboard-navigation/
git commit -m "docs: mark spatial-graph-keyboard-navigation tasks complete (canopy-gtv.2.1)"
```
