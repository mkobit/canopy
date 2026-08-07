import { beforeAll, describe, expect, it } from 'bun:test';
import type { NodePropertiesUpdated } from '@canopy/graph';
import {
  createEventId,
  createGraphId,
  createGraphSession,
  createInstant,
  SYSTEM_DEVICE_ID,
} from '@canopy/graph';
import { createInMemoryEventStore } from '@canopy/storage';
import { executeQuery } from '../src/engine';
import type { QueryBenchmarkFixture } from './fixtures/query-benchmark-fixture';
import { generateQueryBenchmarkFixture } from './fixtures/query-benchmark-fixture';

describe('@canopy/queries GraphSession Query Projection Load Test', () => {
  let fixture: QueryBenchmarkFixture;

  beforeAll(() => {
    fixture = generateQueryBenchmarkFixture({
      nodeCount: 10_000,
      edgeDensity: 2,
      propertyCount: 4,
    });
    // Warm the read-model index cache that `executeQuery` builds lazily per `Graph` reference
    // (see `getGraphIndexes` in @canopy/graph). `fixture.graph` is a synthetic graph built by hand
    // rather than through a `GraphSession`, so it starts with no `_indexes`; without this warm-up
    // call, whichever benchmark below runs first against `fixture.graph` would pay a one-time
    // O(V+E) index-build cost on top of its own query, measuring cold-start latency rather than the
    // steady-state per-query cost the SLA assertions below are actually about.
    executeQuery(fixture.graph, {
      steps: [{ kind: 'node-scan', type: fixture.sampleNodeTypes[0] }],
    });
  });

  it('benchmarks GraphSession initial fold projection under 10k nodes', async () => {
    const store = createInMemoryEventStore();
    const graphId = createGraphId();
    await store.appendEvents(graphId, fixture.events);

    const start = performance.now();
    const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
    const loadResult = await session.load();
    const duration = performance.now() - start;

    expect(loadResult.ok).toBe(true);
    const projectedGraph = session.graph();
    expect(projectedGraph.nodes.size).toBeGreaterThanOrEqual(10_000);
    expect(duration).toBeLessThan(20_000); // SLA target under parallel monorepo test runner load
  }, 30_000);

  it('benchmarks incremental re-projection latency under single event commit to 10k graph', async () => {
    const store = createInMemoryEventStore();
    const graphId = createGraphId();
    await store.appendEvents(graphId, fixture.events);

    const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
    await session.load();

    const targetNodeId = fixture.sampleNodeIds[0];
    if (!targetNodeId) {
      throw new Error('Expected sample node ID');
    }
    const updateEvent: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: targetNodeId,
      changes: new Map([['updatedProp', 'single-update-value']]),
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
    };

    const start = performance.now();
    const commitResult = await session.commit([updateEvent]);
    const duration = performance.now() - start;

    expect(commitResult.ok).toBe(true);
    const updatedNode = session.graph().nodes.get(targetNodeId);
    expect(updatedNode?.properties.get('updatedProp')).toBe('single-update-value');
    expect(duration).toBeLessThan(250); // SLA target: <250ms
  }, 30_000);

  it('benchmarks incremental re-projection latency under batch commit (100 events) to 10k graph', async () => {
    const store = createInMemoryEventStore();
    const graphId = createGraphId();
    await store.appendEvents(graphId, fixture.events);

    const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
    await session.load();

    const batchEvents: readonly NodePropertiesUpdated[] = Array.from(
      { length: 100 },
      (_, index) => {
        const sampleNodeId = fixture.sampleNodeIds[index % fixture.sampleNodeIds.length];
        if (!sampleNodeId) {
          throw new Error('Expected sample node ID');
        }
        return {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: sampleNodeId,
          changes: new Map([['batchProp', `batch-val-${index}`]]),
          timestamp: createInstant(),
          deviceId: SYSTEM_DEVICE_ID,
        };
      },
    );

    const start = performance.now();
    const commitResult = await session.commit(batchEvents);
    const duration = performance.now() - start;

    expect(commitResult.ok).toBe(true);
    expect(duration).toBeLessThan(1000); // SLA target: <1000ms
  }, 30_000);

  it('benchmarks node-scan + filter query step execution under 10k nodes', () => {
    const sessionGraph = fixture.graph;

    const start = performance.now();
    const queryResult = executeQuery(sessionGraph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'filter', predicate: { property: 'category', operator: 'eq', value: 'cat_2' } },
      ],
    });
    const duration = performance.now() - start;

    expect(queryResult.ok).toBe(true);
    if (queryResult.ok) {
      expect(queryResult.value.nodes.length).toBeGreaterThan(0);
    }
    expect(duration).toBeLessThan(15); // SLA target: <15ms
  });

  it('benchmarks 1-hop edge traversal under 10k nodes and 20k edges', () => {
    const sessionGraph = fixture.graph;

    const start = performance.now();
    const queryResult = executeQuery(sessionGraph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'limit', limit: 100 },
        { kind: 'traversal', edgeType: fixture.sampleEdgeTypes[0], direction: 'out' },
      ],
    });
    const duration = performance.now() - start;

    expect(queryResult.ok).toBe(true);
    expect(duration).toBeLessThan(25); // SLA target: <25ms
  });

  it('benchmarks sort + limit + project step pipeline under 10k nodes', () => {
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

    expect(queryResult.ok).toBe(true);
    if (queryResult.ok) {
      expect(queryResult.value.rows?.length).toBe(50);
    }
    expect(duration).toBeLessThan(15); // SLA target: <15ms
  });
});
