# @canopy/queries GraphSession Query Projection Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a layer-isolated benchmark and load testing suite for `@canopy/queries` query execution engine over `GraphSession` projections under 10k+ nodes.

**Architecture:** Implement a synthetic fixture generator in `packages/queries/tests/fixtures/query-benchmark-fixture.ts` producing scale topographies (1k, 5k, 10k nodes), and co-locate load tests in `packages/queries/tests/query-session-projection.load.test.ts` measuring fold latency, query step speeds, and incremental re-projection performance over `MemoryEventLogStore`.

**Tech Stack:** TypeScript (strict mode), `@canopy/queries`, `@canopy/graph`, `@canopy/storage`, Bun test runner.

## Global Constraints

- `@canopy/queries` must NOT import `@canopy/storage-sqlite` or `@canopy/storage-indexeddb` (layer-isolated).
- All type properties must remain `readonly`.
- Errors must return `Result<T, E>` and schemas must validate via Zod.
- Tests run using `bun test`.

---

### Task 1: Synthetic Query Benchmark Fixture Generator

**Files:**
- Create: `packages/queries/tests/fixtures/query-benchmark-fixture.ts`
- Test: `packages/queries/tests/fixtures/query-benchmark-fixture.test.ts`

**Interfaces:**
- Consumes: `@canopy/graph` types (`Graph`, `GraphEvent`, `Node`, `Edge`, `NodeId`, `EdgeTypeId`, `NodeTypeId`, `PropertyValue`, `SYSTEM_IDS`, `createNodeId`, `createEdgeId`, `createEventId`, `createInstant`, `asNodeId`, `asEdgeTypeId`, `asNodeTypeId`).
- Produces: `generateQueryBenchmarkFixture(options: QueryBenchmarkFixtureOptions): QueryBenchmarkFixture`

- [ ] **Step 1: Write the unit test for fixture generator**

Create `packages/queries/tests/fixtures/query-benchmark-fixture.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { generateQueryBenchmarkFixture } from './query-benchmark-fixture';

describe('generateQueryBenchmarkFixture', () => {
  it('generates the specified number of nodes and connected edges', () => {
    const fixture = generateQueryBenchmarkFixture({
      nodeCount: 100,
      edgeDensity: 2,
      propertyCount: 4,
    });

    expect(fixture.graph.nodes.size).toBe(100);
    expect(fixture.events.length).toBeGreaterThanOrEqual(100);
    expect(fixture.sampleNodeIds.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/queries/tests/fixtures/query-benchmark-fixture.test.ts`
Expected: FAIL with module/export not found error.

- [ ] **Step 3: Implement `generateQueryBenchmarkFixture`**

Create `packages/queries/tests/fixtures/query-benchmark-fixture.ts`:

```ts
import type { Graph, GraphEvent, NodeId, EdgeTypeId, NodeTypeId, PropertyValue } from '@canopy/graph';
import {
  createNodeId,
  createEdgeId,
  createEventId,
  createInstant,
  asEdgeTypeId,
  asNodeTypeId,
  SYSTEM_DEVICE_ID,
} from '@canopy/graph';

export interface QueryBenchmarkFixtureOptions {
  readonly nodeCount: number;
  readonly edgeDensity?: number;
  readonly propertyCount?: number;
  readonly clusterCount?: number;
}

export interface QueryBenchmarkFixture {
  readonly graph: Graph;
  readonly events: readonly GraphEvent[];
  readonly sampleNodeIds: readonly NodeId[];
  readonly sampleEdgeTypes: readonly EdgeTypeId[];
  readonly sampleNodeTypes: readonly NodeTypeId[];
}

export function generateQueryBenchmarkFixture(
  options: QueryBenchmarkFixtureOptions,
): QueryBenchmarkFixture {
  const { nodeCount, edgeDensity = 2, propertyCount = 4 } = options;
  const events: GraphEvent[] = [];
  const sampleNodeIds: NodeId[] = [];
  const nodeTypeId = asNodeTypeId('benchmark:Node');
  const edgeTypeId = asEdgeTypeId('benchmark:Edge');

  const nodesMap = new Map();
  const edgesMap = new Map();

  for (let i = 0; i < nodeCount; i++) {
    const nodeId = createNodeId();
    sampleNodeIds.push(nodeId);

    const properties = new Map<string, PropertyValue>();
    for (let p = 0; p < propertyCount; p++) {
      properties.set(`prop_${p}`, `value_${i % 10}_${p}`);
    }
    properties.set('category', `cat_${i % 5}`);
    properties.set('index', i);

    nodesMap.set(nodeId, {
      id: nodeId,
      type: nodeTypeId,
      properties,
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    });

    events.push({
      id: createEventId(),
      type: 'NodeCreated',
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
      graphId: 'benchmark-graph' as any,
      payload: {
        nodeId,
        type: nodeTypeId,
        properties: Object.fromEntries(properties),
      },
    });
  }

  // Generate edges for topology traversal testing
  const targetEdgeCount = Math.floor(nodeCount * edgeDensity);
  for (let e = 0; e < targetEdgeCount; e++) {
    const sourceIndex = e % nodeCount;
    const targetIndex = (e + 1 + Math.floor(e / nodeCount)) % nodeCount;
    if (sourceIndex === targetIndex) continue;

    const edgeId = createEdgeId();
    const sourceId = sampleNodeIds[sourceIndex];
    const targetId = sampleNodeIds[targetIndex];

    edgesMap.set(edgeId, {
      id: edgeId,
      type: edgeTypeId,
      source: sourceId,
      target: targetId,
      properties: new Map(),
      metadata: {
        created: createInstant(),
        modified: createInstant(),
        modifiedBy: SYSTEM_DEVICE_ID,
      },
    });

    events.push({
      id: createEventId(),
      type: 'EdgeCreated',
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
      graphId: 'benchmark-graph' as any,
      payload: {
        edgeId,
        type: edgeTypeId,
        source: sourceId,
        target: targetId,
        properties: {},
      },
    });
  }

  const graph: Graph = {
    nodes: nodesMap,
    edges: edgesMap,
  };

  return {
    graph,
    events,
    sampleNodeIds,
    sampleEdgeTypes: [edgeTypeId],
    sampleNodeTypes: [nodeTypeId],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/queries/tests/fixtures/query-benchmark-fixture.test.ts`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add packages/queries/tests/fixtures/query-benchmark-fixture.ts packages/queries/tests/fixtures/query-benchmark-fixture.test.ts
git commit -m "feat(queries): add synthetic query benchmark fixture generator"
```

---

### Task 2: GraphSession Initial Fold Projection Benchmark

**Files:**
- Create: `packages/queries/tests/query-session-projection.load.test.ts`

**Interfaces:**
- Consumes: `generateQueryBenchmarkFixture` from Task 1, `createGraphSession` from `@canopy/graph`, `MemoryEventLogStore` from `@canopy/storage`.
- Produces: Fold projection latency load test across 1k, 5k, and 10k nodes.

- [ ] **Step 1: Write initial fold projection load test**

Create `packages/queries/tests/query-session-projection.load.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { createGraphSession, createGraphId, SYSTEM_DEVICE_ID } from '@canopy/graph';
import { MemoryEventLogStore } from '@canopy/storage';
import { generateQueryBenchmarkFixture } from './fixtures/query-benchmark-fixture';

describe('@canopy/queries GraphSession Query Projection Load Test', () => {
  it('benchmarks GraphSession initial fold projection under 10k nodes', async () => {
    const fixture = generateQueryBenchmarkFixture({
      nodeCount: 10000,
      edgeDensity: 2,
      propertyCount: 4,
    });

    const store = new MemoryEventLogStore();
    const graphId = createGraphId();

    for (const ev of fixture.events) {
      await store.append({ ...ev, graphId });
    }

    const start = performance.now();
    const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
    await session.load();
    const duration = performance.now() - start;

    const projectedGraph = session.graph();
    expect(projectedGraph.nodes.size).toBe(10000);
    expect(duration).toBeLessThan(250); // SLA target: <250ms fold time
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test packages/queries/tests/query-session-projection.load.test.ts`
Expected: PASS

---

### Task 3: Query Engine Execution Benchmarks (`node-scan`, `filter`, `traversal`, `sort`, `limit`, `project`)

**Files:**
- Modify: `packages/queries/tests/query-session-projection.load.test.ts`

**Interfaces:**
- Consumes: `executeQuery` from `@canopy/queries`, `generateQueryBenchmarkFixture`.
- Produces: Benchmarks for scan/filter, traversal, sort/limit/project steps under 10k nodes.

- [ ] **Step 1: Add step-by-step query execution load tests**

Append to `packages/queries/tests/query-session-projection.load.test.ts`:

```ts
  it('benchmarks node-scan + filter query step execution under 10k nodes', async () => {
    const fixture = generateQueryBenchmarkFixture({ nodeCount: 10000, edgeDensity: 2 });
    const sessionGraph = fixture.graph;

    const start = performance.now();
    const queryResult = executeQuery(sessionGraph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'filter', predicate: { property: 'category', operator: 'eq', value: 'cat_2' } },
      ],
    });
    const duration = performance.now() - start;

    expect(queryResult.isOk()).toBe(true);
    if (queryResult.isOk()) {
      expect(queryResult.value.items.length).toBeGreaterThan(0);
    }
    expect(duration).toBeLessThan(15); // SLA target: <15ms
  });

  it('benchmarks 1-hop edge traversal under 10k nodes and 20k edges', async () => {
    const fixture = generateQueryBenchmarkFixture({ nodeCount: 10000, edgeDensity: 2 });
    const sessionGraph = fixture.graph;

    const start = performance.now();
    const queryResult = executeQuery(sessionGraph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'limit', limit: 100 },
        { kind: 'traversal', edgeType: fixture.sampleEdgeTypes[0], direction: 'outbound' },
      ],
    });
    const duration = performance.now() - start;

    expect(queryResult.isOk()).toBe(true);
    expect(duration).toBeLessThan(25); // SLA target: <25ms
  });

  it('benchmarks sort + limit + project step pipeline under 10k nodes', async () => {
    const fixture = generateQueryBenchmarkFixture({ nodeCount: 10000, edgeDensity: 2 });
    const sessionGraph = fixture.graph;

    const start = performance.now();
    const queryResult = executeQuery(sessionGraph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'sort', sort: { property: 'index', direction: 'desc' } },
        { kind: 'limit', limit: 50 },
        { kind: 'project', properties: ['category', 'index'] },
      ],
    });
    const duration = performance.now() - start;

    expect(queryResult.isOk()).toBe(true);
    if (queryResult.isOk()) {
      expect(queryResult.value.rows?.length).toBe(50);
    }
    expect(duration).toBeLessThan(15); // SLA target: <15ms
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test packages/queries/tests/query-session-projection.load.test.ts`
Expected: PASS

---

### Task 4: Incremental Re-Projection & Commit Benchmark

**Files:**
- Modify: `packages/queries/tests/query-session-projection.load.test.ts`

**Interfaces:**
- Consumes: `GraphSession.commit()`.
- Produces: Latency benchmark for single property update commits into a 10k-node graph.

- [ ] **Step 1: Add incremental commit re-projection load test**

Append to `packages/queries/tests/query-session-projection.load.test.ts`:

```ts
  it('benchmarks incremental re-projection latency under single event commit to 10k graph', async () => {
    const fixture = generateQueryBenchmarkFixture({ nodeCount: 10000, edgeDensity: 2 });
    const store = new MemoryEventLogStore();
    const graphId = createGraphId();

    for (const ev of fixture.events) {
      await store.append({ ...ev, graphId });
    }

    const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
    await session.load();

    const targetNodeId = fixture.sampleNodeIds[0];
    const updateEvent = {
      id: createEventId(),
      type: 'NodePropertiesUpdated' as const,
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
      graphId,
      payload: {
        nodeId: targetNodeId,
        properties: { prop_0: 'updated_value_load_test' },
      },
    };

    const start = performance.now();
    const commitResult = await session.commit([updateEvent]);
    const duration = performance.now() - start;

    expect(commitResult.isOk()).toBe(true);
    const updatedNode = session.graph().nodes.get(targetNodeId);
    expect(updatedNode?.properties.get('prop_0')).toBe('updated_value_load_test');
    expect(duration).toBeLessThan(5); // SLA target: <5ms
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `bun test packages/queries/tests/query-session-projection.load.test.ts`
Expected: PASS

- [ ] **Step 3: Commit Tasks 2-4**

```bash
git add packages/queries/tests/query-session-projection.load.test.ts
git commit -m "feat(queries): add GraphSession query projection load test suite under 10k nodes"
```

---

### Task 5: Quality Gate & Full Verification

- [ ] **Step 1: Run full quality gates**

Run:
```bash
bun run build
bun run lint
bun run typecheck
bun test
```
Expected: All build, lint, typecheck, and test gates pass with 0 errors.
