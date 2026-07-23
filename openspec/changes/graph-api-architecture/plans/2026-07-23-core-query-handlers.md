# Core query execution handlers implementation plan

> **Change Context:** `openspec/changes/graph-api-architecture` (Task 2: Core query execution handlers)

**Goal:** Implement core query execution handlers in `@canopy/api-adapter` delegating to `@canopy/queries` against projected in-memory graph state with resource bounds, cycle safety, property presence checks, tenant isolation, and strict immutability.

**Architecture:** Extend `@canopy/api-adapter` payload definitions in `src/api-payloads.ts` and implement handler entrypoints in `src/query-handlers.ts`. Direct ID lookups inspect `context.graph` maps directly while criteria queries build `@canopy/queries` ASTs for execution. Traversals utilize BFS with `visitedNodes` / `visitedEdges` tracking, depth/cost limits, and tenant scope filtering.

**Tech Stack:** TypeScript, `@canopy/graph`, `@canopy/queries`, `@canopy/api-adapter`, Bun test runner.

## Global Constraints

- All domain and payload types must have `readonly` properties.
- Function return types must use `Result<T, ApiAdapterError>`, never throw exceptions.
- Code style must follow one-sentence-per-line prose in docs and comments.
- No `any` or `Record<string, unknown>` unless strictly necessary.

---

### Task 1: Payload and result types in `@canopy/api-adapter`

**Files:**
- Modify: `packages/api-adapter/src/api-payloads.ts`
- Modify: `packages/api-adapter/tests/api-payloads.test.ts`
- Modify: `packages/api-adapter/src/index.ts`

**Interfaces:**
- Consumes: `NodeId`, `EdgeId`, `TypeId`, `PropertyValue` from `@canopy/graph`, `Filter`, `Sort` from `@canopy/queries`.
- Produces: `NodeQueryPayload`, `EdgeQueryPayload`, `PropertyLookupPayload`, `TraversalQueryPayload`, `PropertyLookupResult`.

- [ ] **Step 1: Write failing type validation tests in `api-payloads.test.ts`**

Add unit tests verifying query payload construction and export completeness.

```typescript
import type {
  NodeQueryPayload,
  EdgeQueryPayload,
  PropertyLookupPayload,
  TraversalQueryPayload,
  PropertyLookupResult,
} from '../src';
import { describe, expect, test } from 'bun:test';
import { createNodeId, createEdgeId, createTypeId } from '@canopy/graph';

describe('Query payload types', () => {
  test('constructs valid NodeQueryPayload', () => {
    const payload: NodeQueryPayload = {
      id: createNodeId('node-1'),
      type: createTypeId('doc'),
      limit: 10,
    };
    expect(payload.id).toBe('node-1');
  });

  test('constructs valid EdgeQueryPayload', () => {
    const payload: EdgeQueryPayload = {
      source: createNodeId('node-1'),
      target: createNodeId('node-2'),
      direction: 'out',
      limit: 5,
    };
    expect(payload.direction).toBe('out');
  });

  test('constructs valid PropertyLookupPayload and Result', () => {
    const payload: PropertyLookupPayload = {
      entityId: createNodeId('node-1'),
      propertyKey: 'title',
    };
    const result: PropertyLookupResult = {
      entityId: createNodeId('node-1'),
      properties: { title: 'Test' },
    };
    expect(payload.propertyKey).toBe('title');
    expect(result.properties.title).toBe('Test');
  });

  test('constructs valid TraversalQueryPayload', () => {
    const payload: TraversalQueryPayload = {
      startNodeIds: [createNodeId('node-1')],
      maxDepth: 3,
      maxCost: 100,
    };
    expect(payload.startNodeIds).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/api-payloads.test.ts`
Expected: FAIL with missing module exports `NodeQueryPayload`, `EdgeQueryPayload`, etc.

- [ ] **Step 3: Implement query payload types in `api-payloads.ts` and re-export in `index.ts`**

In `packages/api-adapter/src/api-payloads.ts`:

```typescript
import type { EdgeId, NodeId, PropertyValue, Result, TypeId } from '@canopy/graph';
import type { Filter, Sort } from '@canopy/queries';
import { Temporal } from 'temporal-polyfill';
import type { ApiAdapterContext } from './api-context';
import type { ApiAdapterError } from './result-errors';

export type NodeQueryPayload = Readonly<{
  id?: NodeId;
  type?: TypeId;
  filter?: Filter;
  sort?: Sort;
  limit?: number;
}>;

export type EdgeQueryPayload = Readonly<{
  id?: EdgeId;
  type?: TypeId;
  source?: NodeId;
  target?: NodeId;
  direction?: 'in' | 'out' | 'both';
  includeTargetSummary?: boolean;
  limit?: number;
}>;

export type PropertyLookupPayload = Readonly<{
  entityId: NodeId | EdgeId;
  propertyKey?: string;
}>;

export type TraversalQueryPayload = Readonly<{
  startNodeIds: readonly NodeId[];
  edgeType?: TypeId;
  direction?: 'in' | 'out' | 'both';
  maxDepth?: number;
  maxCost?: number;
}>;

export type PropertyLookupResult = Readonly<{
  entityId: NodeId | EdgeId;
  properties: Readonly<Record<string, PropertyValue>>;
}>;
```

In `packages/api-adapter/src/index.ts`:

```typescript
export * from './api-context';
export * from './api-payloads';
export * from './result-errors';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/api-payloads.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/api-payloads.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/api-payloads.test.ts
git commit -m "feat(api-adapter): define query request payloads and result types"
```

---

### Task 2: Query execution handlers in `@canopy/api-adapter`

**Files:**
- Create: `packages/api-adapter/src/query-handlers.ts`
- Modify: `packages/api-adapter/src/index.ts`
- Create: `packages/api-adapter/tests/query-handlers.test.ts`

**Interfaces:**
- Consumes: `ApiRequest`, `ApiResponse`, `ApiNodePayload`, `ApiEdgePayload`, `ApiTraversalPayload`, `NodeQueryPayload`, `EdgeQueryPayload`, `PropertyLookupPayload`, `TraversalQueryPayload`, `PropertyLookupResult` from `./api-payloads`.
- Produces: `executeNodeQuery`, `executeEdgeQuery`, `executePropertyLookup`, `executeGraphTraversal`.

- [ ] **Step 1: Write comprehensive failing tests in `query-handlers.test.ts`**

Covering direct ID lookups, AST filtering, property presence, BFS cycle safety, tenant scope checks, and depth/cost limits.

```typescript
import { describe, expect, test } from 'bun:test';
import {
  createGraph,
  createNodeId,
  createEdgeId,
  createTypeId,
  addNode,
  addEdge,
  createDeviceId,
} from '@canopy/graph';
import {
  createApiAdapterContext,
  createApiRequest,
  executeNodeQuery,
  executeEdgeQuery,
  executePropertyLookup,
  executeGraphTraversal,
} from '../src';

const deviceId = createDeviceId('device-1');

const setupTestGraph = () => {
  const node1 = {
    id: createNodeId('n1'),
    type: createTypeId('doc'),
    properties: new Map([['title', 'Doc 1'], ['tenantId', 't1']]),
    metadata: { created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', modifiedBy: deviceId },
  };
  const node2 = {
    id: createNodeId('n2'),
    type: createTypeId('doc'),
    properties: new Map([['title', 'Doc 2'], ['tenantId', 't1']]),
    metadata: { created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', modifiedBy: deviceId },
  };
  const node3 = {
    id: createNodeId('n3'),
    type: createTypeId('tag'),
    properties: new Map([['name', 'Tag 1'], ['tenantId', 't2']]),
    metadata: { created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', modifiedBy: deviceId },
  };
  const edge1 = {
    id: createEdgeId('e1'),
    type: createTypeId('links'),
    source: node1.id,
    target: node2.id,
    properties: new Map([['weight', 1]]),
    metadata: { created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', modifiedBy: deviceId },
  };
  const cycleEdge = {
    id: createEdgeId('e2'),
    type: createTypeId('links'),
    source: node2.id,
    target: node1.id,
    properties: new Map(),
    metadata: { created: '2026-01-01T00:00:00.000Z', modified: '2026-01-01T00:00:00.000Z', modifiedBy: deviceId },
  };

  let g = createGraph();
  g = addNode(g, node1).value;
  g = addNode(g, node2).value;
  g = addNode(g, node3).value;
  g = addEdge(g, edge1).value;
  g = addEdge(g, cycleEdge).value;
  return g;
};

describe('Query execution handlers', () => {
  test('executeNodeQuery direct lookup by ID returns node', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-1', context, { id: createNodeId('n1') });

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0].id).toBe('n1');
    }
  });

  test('executeNodeQuery direct lookup missing ID returns NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-2', context, { id: createNodeId('non-existent') });

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeNodeQuery filters by type', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-3', context, { type: createTypeId('doc') });

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(2);
    }
  });

  test('executeEdgeQuery direct lookup by ID returns edge', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-4', context, { id: createEdgeId('e1') });

    const res = executeEdgeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(1);
      expect(res.value[0].id).toBe('e1');
    }
  });

  test('executePropertyLookup returns entity properties', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-5', context, { entityId: createNodeId('n1') });

    const res = executePropertyLookup(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.properties.title).toBe('Doc 1');
    }
  });

  test('executePropertyLookup with key returns specified property or NOT_FOUND', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const reqFound = createApiRequest('req-6', context, { entityId: createNodeId('n1'), propertyKey: 'title' });
    const reqMissing = createApiRequest('req-7', context, { entityId: createNodeId('n1'), propertyKey: 'missing' });

    const resFound = executePropertyLookup(reqFound);
    expect(resFound.ok).toBe(true);
    if (resFound.ok) {
      expect(resFound.value.properties.title).toBe('Doc 1');
    }

    const resMissing = executePropertyLookup(reqMissing);
    expect(resMissing.ok).toBe(false);
    if (!resMissing.ok) {
      expect(resMissing.error.category).toBe('NOT_FOUND');
    }
  });

  test('executeGraphTraversal safely handles cycles and returns connected nodes/edges', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-8', context, {
      startNodeIds: [createNodeId('n1')],
      maxDepth: 5,
    });

    const res = executeGraphTraversal(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.nodes).toHaveLength(2);
      expect(res.value.edges).toHaveLength(2);
    }
  });

  test('executeGraphTraversal fails with VALIDATION_ERROR on empty startNodeIds', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph });
    const req = createApiRequest('req-9', context, { startNodeIds: [] });

    const res = executeGraphTraversal(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('VALIDATION_ERROR');
    }
  });

  test('executeGraphTraversal fails with RESOURCE_EXHAUSTED when exceeding cost limit', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({ graph, limits: { maxQueryCost: 1, maxQueryDepth: 10 } });
    const req = createApiRequest('req-10', context, {
      startNodeIds: [createNodeId('n1')],
      maxCost: 1,
    });

    const res = executeGraphTraversal(req);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.category).toBe('RESOURCE_EXHAUSTED');
    }
  });

  test('executeNodeQuery enforces tenant isolation when authContext has tenantId', () => {
    const graph = setupTestGraph();
    const context = createApiAdapterContext({
      graph,
      authContext: { tenantId: 't1' },
    });
    const req = createApiRequest('req-11', context, {});

    const res = executeNodeQuery(req);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toHaveLength(2);
      expect(res.value.every((n) => n.properties.tenantId === 't1')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api-adapter/tests/query-handlers.test.ts`
Expected: FAIL with missing module `../src/query-handlers`.

- [ ] **Step 3: Implement query execution handlers in `src/query-handlers.ts`**

Create `packages/api-adapter/src/query-handlers.ts`:

```typescript
import type { Edge, Node } from '@canopy/graph';
import { createApiAdapterError, ok, err } from '@canopy/graph';
import { executeQuery } from '@canopy/queries';
import type { QueryStep } from '@canopy/queries';
import type {
  ApiEdgePayload,
  ApiNodePayload,
  ApiRequest,
  ApiResponse,
  ApiTraversalPayload,
  EdgeQueryPayload,
  NodeQueryPayload,
  PropertyLookupPayload,
  PropertyLookupResult,
  TraversalQueryPayload,
} from './api-payloads';

const mapNodeToPayload = (node: Node): ApiNodePayload => ({
  id: node.id,
  type: node.type,
  properties: Object.fromEntries(node.properties.entries()),
  createdAt: node.metadata.created,
  updatedAt: node.metadata.modified,
});

const mapEdgeToPayload = (edge: Edge): ApiEdgePayload => ({
  id: edge.id,
  type: edge.type,
  source: edge.source,
  target: edge.target,
  properties: Object.fromEntries(edge.properties.entries()),
});

export const executeNodeQuery = (
  request: ApiRequest<NodeQueryPayload>,
): ApiResponse<readonly ApiNodePayload[]> => {
  const { graph, authContext } = request.context;
  const { id, type, filter, sort, limit } = request.payload;

  if (id !== undefined) {
    const node = graph.nodes.get(id);
    if (!node) {
      return err(createApiAdapterError('NOT_FOUND', `Node not found: ${id}`));
    }
    if (authContext?.tenantId) {
      const tenant = node.properties.get('tenantId');
      if (tenant !== authContext.tenantId) {
        return err(createApiAdapterError('NOT_FOUND', `Node not found: ${id}`));
      }
    }
    return ok([mapNodeToPayload(node)]);
  }

  const steps: QueryStep[] = [{ kind: 'node-scan', type }];
  if (authContext?.tenantId) {
    steps.push({
      kind: 'filter',
      predicate: { property: 'tenantId', operator: 'eq', value: authContext.tenantId },
    });
  }
  if (filter) {
    steps.push({ kind: 'filter', predicate: filter });
  }
  if (sort) {
    steps.push({ kind: 'sort', sort });
  }
  if (limit !== undefined && limit > 0) {
    steps.push({ kind: 'limit', limit });
  }

  const queryResult = executeQuery(graph, { steps });
  if (!queryResult.ok) {
    return err(createApiAdapterError('INTERNAL_ERROR', queryResult.error.message));
  }

  const nodes = queryResult.value.nodes.map(mapNodeToPayload);
  return ok(nodes);
};

export const executeEdgeQuery = (
  request: ApiRequest<EdgeQueryPayload>,
): ApiResponse<readonly ApiEdgePayload[]> => {
  const { graph, authContext } = request.context;
  const { id, type, source, target, limit } = request.payload;

  if (id !== undefined) {
    const edge = graph.edges.get(id);
    if (!edge) {
      return err(createApiAdapterError('NOT_FOUND', `Edge not found: ${id}`));
    }
    return ok([mapEdgeToPayload(edge)]);
  }

  const maxCap = limit !== undefined && limit > 0 ? Math.min(limit, 1000) : 1000;
  const matchingEdges: ApiEdgePayload[] = [];

  for (const edge of graph.edges.values()) {
    if (type && edge.type !== type) continue;
    if (source && edge.source !== source) continue;
    if (target && edge.target !== target) continue;

    if (authContext?.tenantId) {
      const sourceNode = graph.nodes.get(edge.source);
      if (sourceNode && sourceNode.properties.get('tenantId') !== authContext.tenantId) {
        continue;
      }
    }

    matchingEdges.push(mapEdgeToPayload(edge));
    if (matchingEdges.length >= maxCap) break;
  }

  return ok(matchingEdges);
};

export const executePropertyLookup = (
  request: ApiRequest<PropertyLookupPayload>,
): ApiResponse<PropertyLookupResult> => {
  const { graph } = request.context;
  const { entityId, propertyKey } = request.payload;

  const node = graph.nodes.get(entityId as never);
  const edge = graph.edges.get(entityId as never);
  const entity = node ?? edge;

  if (!entity) {
    return err(createApiAdapterError('NOT_FOUND', `Entity not found: ${entityId}`));
  }

  const allProps = Object.fromEntries(entity.properties.entries());

  if (propertyKey !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(allProps, propertyKey)) {
      return err(
        createApiAdapterError('NOT_FOUND', `Property key '${propertyKey}' not found on entity ${entityId}`),
      );
    }
    return ok({
      entityId,
      properties: { [propertyKey]: allProps[propertyKey] },
    });
  }

  return ok({
    entityId,
    properties: allProps,
  });
};

export const executeGraphTraversal = (
  request: ApiRequest<TraversalQueryPayload>,
): ApiResponse<ApiTraversalPayload> => {
  const { graph, limits } = request.context;
  const { startNodeIds, edgeType, direction = 'out', maxDepth, maxCost } = request.payload;

  if (!startNodeIds || startNodeIds.length === 0) {
    return err(createApiAdapterError('VALIDATION_ERROR', 'startNodeIds must not be empty'));
  }

  const effectiveMaxDepth = Math.min(
    maxDepth ?? limits?.maxQueryDepth ?? 10,
    limits?.maxQueryDepth ?? 10,
  );
  const effectiveMaxCost = Math.min(
    maxCost ?? limits?.maxQueryCost ?? 1000,
    limits?.maxQueryCost ?? 1000,
  );

  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();
  const nodePayloads: ApiNodePayload[] = [];
  const edgePayloads: ApiEdgePayload[] = [];

  interface QueueItem {
    readonly nodeId: string;
    readonly depth: number;
  }

  const queue: QueueItem[] = [];

  for (const id of startNodeIds) {
    const node = graph.nodes.get(id);
    if (node) {
      visitedNodes.add(id);
      nodePayloads.push(mapNodeToPayload(node));
      queue.push({ nodeId: id, depth: 0 });
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= effectiveMaxDepth) continue;

    for (const edge of graph.edges.values()) {
      if (edgeType && edge.type !== edgeType) continue;

      let nextNodeId: string | undefined;
      if ((direction === 'out' || direction === 'both') && edge.source === current.nodeId) {
        nextNodeId = edge.target;
      } else if ((direction === 'in' || direction === 'both') && edge.target === current.nodeId) {
        nextNodeId = edge.source;
      }

      if (!nextNodeId) continue;

      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        edgePayloads.push(mapEdgeToPayload(edge));
      }

      if (!visitedNodes.has(nextNodeId)) {
        if (visitedNodes.size >= effectiveMaxCost) {
          return err(
            createApiAdapterError(
              'RESOURCE_EXHAUSTED',
              `Traversal cost exceeded maximum limit of ${effectiveMaxCost}`,
            ),
          );
        }

        const nextNode = graph.nodes.get(nextNodeId as never);
        if (nextNode) {
          visitedNodes.add(nextNodeId);
          nodePayloads.push(mapNodeToPayload(nextNode));
          queue.push({ nodeId: nextNodeId, depth: current.depth + 1 });
        }
      }
    }
  }

  return ok({
    nodes: nodePayloads,
    edges: edgePayloads,
  });
};
```

Export `query-handlers` in `packages/api-adapter/src/index.ts`:

```typescript
export * from './api-context';
export * from './api-payloads';
export * from './query-handlers';
export * from './result-errors';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api-adapter/tests/query-handlers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/api-adapter/src/query-handlers.ts packages/api-adapter/src/index.ts packages/api-adapter/tests/query-handlers.test.ts
git commit -m "feat(api-adapter): implement core query execution handlers"
```

---

### Task 3: Quality gates and full verification

**Files:**
- None (verification phase across workspace)

- [ ] **Step 1: Build all packages**

Run: `bun run build`
Expected: Clean build across workspace.

- [ ] **Step 2: Lint codebase**

Run: `bun run lint`
Expected: Clean pass with no functional/immutable/eslint errors.

- [ ] **Step 3: Typecheck codebase**

Run: `bun run typecheck`
Expected: Zero TypeScript errors.

- [ ] **Step 4: Run all tests**

Run: `bun test`
Expected: All tests pass cleanly.

- [ ] **Step 5: Commit and verification state**

Verify `git status` is clean.
