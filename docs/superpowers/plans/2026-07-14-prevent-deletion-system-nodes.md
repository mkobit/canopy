# Prevent deletion of system nodes implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect system-seeded default views, renderers, and other system-defined nodes from deletion, and refactor the large bootstrap file.

**Architecture:**
- Implement a helper function `isSystemNodeId` to detect system-prefixed NodeIds.
- Add checks in `removeNode` and `validateCommit` to return a `Result` error when a system node deletion is requested.
- Note on reinstatement: The existing `bootstrap` logic runs on graph loading and automatically re-adds (reinstates) any missing system nodes/edges if they are not present in the graph.
- Refactoring: Extract static data definitions from `bootstrap.ts` into a new `bootstrap-definitions.ts` file to keep both files small and modular (under 300 lines).

**Tech Stack:** TypeScript, Bun test runner.

---

### Task 1: Add `isSystemNodeId` helper

**Files:**
- Modify: [system.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/system.ts)
- Create: [system.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/system.test.ts)

- [x] **Step 1: Write the failing test**

Create the new file `packages/graph/src/system.test.ts`.

```typescript
import { describe, it, expect } from 'bun:test';
import { isSystemNodeId } from './system';
import { asNodeId } from './factories';

describe('isSystemNodeId', () => {
  it('identifies system node IDs correctly', () => {
    expect(isSystemNodeId(asNodeId('system:renderer:text'))).toBe(true);
    expect(isSystemNodeId(asNodeId('system:view:text-block'))).toBe(true);
    expect(isSystemNodeId(asNodeId('namespace:system'))).toBe(true);
    expect(isSystemNodeId(asNodeId('node:type:node-type'))).toBe(true);
    expect(isSystemNodeId(asNodeId('edge:type:defines'))).toBe(true);
    expect(isSystemNodeId(asNodeId('query:system:all-nodes'))).toBe(true);
    expect(isSystemNodeId(asNodeId('view:system:all-nodes'))).toBe(true);
    expect(isSystemNodeId(asNodeId('meta:renderer'))).toBe(true);
  });

  it('identifies non-system node IDs correctly', () => {
    expect(isSystemNodeId(asNodeId('user:node:123'))).toBe(false);
    expect(isSystemNodeId(asNodeId('some-other-id'))).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bun test packages/graph/src/system.test.ts`
Expected: FAIL with "isSystemNodeId is not defined" or similar import error.

- [x] **Step 3: Write minimal implementation**

Modify `packages/graph/src/system.ts` by adding the import and helper function.

```typescript
import type { NodeId } from './identifiers';
```

And at the end of the file:

```typescript
/**
 * Checks if a NodeId belongs to a system-defined node.
 */
export function isSystemNodeId(nodeId: NodeId | string): boolean {
  const prefixes = [
    'system:',
    'namespace:',
    'node:type:',
    'edge:type:',
    'query:system:',
    'view:system:',
    'meta:',
  ];
  return prefixes.some((prefix) => nodeId.startsWith(prefix));
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `bun test packages/graph/src/system.test.ts`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/graph/src/system.ts packages/graph/src/system.test.ts
git commit -m "feat: add isSystemNodeId helper and tests"
```

---

### Task 2: Prevent deletion in `removeNode` operation

**Files:**
- Modify: [node.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/ops/node.ts)
- Modify: [graph.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/tests/graph.test.ts)

- [ ] **Step 1: Write the failing test**

Add a test case at the end of the `removeNode` describe block or test suite in `packages/graph/src/tests/graph.test.ts`.

```typescript
  it('should reject deleting system-defined nodes', () => {
    const systemNodeId = asNodeId('system:renderer:text');
    const result = removeNode(emptyGraph, systemNodeId, {
      deviceId: asDeviceId('00000000-0000-0000-0000-000000000000'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Cannot delete system node');
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/graph/src/tests/graph.test.ts`
Expected: FAIL on the new test case.

- [ ] **Step 3: Write minimal implementation**

Modify `packages/graph/src/ops/node.ts` to import `isSystemNodeId` and check it at the start of `removeNode`.

```typescript
import { isSystemNodeId } from '../system';
```

And inside `removeNode`:

```typescript
export function removeNode(
  graph: Graph,
  nodeId: NodeId,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, Error> {
  if (isSystemNodeId(nodeId)) {
    return err(new Error(`Cannot delete system node: ${nodeId}`));
  }

  if (!graph.nodes.has(nodeId)) {
    return ok({
      graph,
      events: [],
      value: graph,
    });
  }
  // ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/graph/src/tests/graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/graph/src/ops/node.ts packages/graph/src/tests/graph.test.ts
git commit -m "feat: reject system node deletion in removeNode"
```

---

### Task 3: Prevent deletion in `validateCommit` of `GraphSession`

**Files:**
- Modify: [graph-session.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/graph-session.ts)
- Modify: [graph-session.test.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/graph-session.test.ts)

- [ ] **Step 1: Write the failing test**

Add a test case in `packages/graph/src/graph-session.test.ts` to verify that committing a `NodeDeleted` event targeting a system node fails validation.

```typescript
  it('rejects commits containing NodeDeleted events for system nodes', async () => {
    const eventLog = createTestEventLog();
    const graphId = createGraphId();
    const session = createGraphSession(eventLog, graphId, sessionDeviceId);
    await session.load();

    const deleteEvent: GraphEvent = {
      type: 'NodeDeleted',
      eventId: createEventId(),
      id: asNodeId('system:renderer:text'),
      timestamp: createInstant(),
      deviceId: sessionDeviceId,
    };

    const result = await session.commit([deleteEvent]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Cannot delete system node');
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/graph/src/graph-session.test.ts`
Expected: FAIL on the new test case.

- [ ] **Step 3: Write minimal implementation**

Modify `packages/graph/src/graph-session.ts` to import `isSystemNodeId` and check it in `validateCommit`.

```typescript
import { isSystemNodeId } from './system';
```

And inside `validateCommit` in `packages/graph/src/graph-session.ts`:

```typescript
function validateCommit(graph: Graph, events: readonly GraphEvent[]): Result<void, Error> {
  // eslint-disable-next-line functional/no-loop-statements
  for (const event of events) {
    if (event.type === 'NodeDeleted' && isSystemNodeId(event.id)) {
      return err(new Error(`Cannot delete system node: ${event.id}`));
    }
  }

  const dryRun = projectGraph(events, graph);
  if (!dryRun.ok) return dryRun;
  // ... rest of validation logic ...
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/graph/src/graph-session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/graph/src/graph-session.ts packages/graph/src/graph-session.test.ts
git commit -m "feat: validate and reject system node deletion in GraphSession commit"
```

---

### Task 4: Refactor and split `bootstrap.ts`

**Files:**
- Create: [bootstrap-definitions.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap-definitions.ts)
- Modify: [bootstrap.ts](file:///home/mkobit/workspace/mkobit/canopy/packages/graph/src/bootstrap.ts)

- [ ] **Step 1: Extract definition constants**

Move `nodeTypeProperties`, `edgeTypeProperties`, `namespaceMigrations`, `coreNodeTypes`, `coreEdgeTypes`, `systemQueries`, `systemViews`, `systemSettings`, `systemRenderers`, `defaultViews` and their local helper functions (`createProperties`, `text`, `reference`, `createBootstrapNode`) from `bootstrap.ts` to `bootstrap-definitions.ts`.

- [ ] **Step 2: Clean up imports and exports**

Ensure that `bootstrap-definitions.ts` exports these constants, and that `bootstrap.ts` imports them.

- [ ] **Step 3: Run all tests to verify correctness**

Run: `bun test`
Expected: PASS (all 351+ tests should pass without any issue).

- [ ] **Step 4: Commit**

```bash
git add packages/graph/src/bootstrap.ts packages/graph/src/bootstrap-definitions.ts
git commit -m "refactor: split large bootstrap file into bootstrap and bootstrap-definitions"
```
