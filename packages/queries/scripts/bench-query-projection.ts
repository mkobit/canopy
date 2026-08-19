/**
 * Non-gating benchmark for GraphSession query projection under a 10k-node graph (canopy-8hw).
 *
 * This used to be `tests/query-session-projection.load.test.ts`: single-sample wall-clock
 * `expect(duration).toBeLessThan(N)` assertions inside the `bun test` gate. On a contended
 * dev machine (or a noisy CI runner) a single sample routinely blew past its budget --
 * reproduced 21-24s against a 20s SLA on an idle-looking WSL2 box, and 50s+ under real load --
 * without any actual regression in the code under test. A wall-clock sample is not a
 * deterministic correctness signal, so it does not belong in the test gate.
 *
 * This mirrors `packages/graph/scripts/bench-index-maintenance.ts`: median/p95 over repeated
 * samples, printed for a human to read, not asserted. Not wired into `bun test` or CI -- run
 * manually via `bun run --filter @canopy/queries bench:query-projection`.
 *
 * Correctness for `GraphSession.load()`/`commit()` and `executeQuery()` step semantics is
 * already covered deterministically (small, fixed graphs) by `graph-session.test.ts`,
 * `query.test.ts`, and `engine.equivalence.property.test.ts` -- this script only measures
 * latency at 10k-node scale, it does not re-prove correctness.
 */
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
import { generateQueryBenchmarkFixture } from '../tests/fixtures/query-benchmark-fixture';

const LOAD_REPETITIONS = 7; // former SLA: <20_000ms
const COMMIT_REPETITIONS = 30; // former SLA: <250ms (single event)
const BATCH_COMMIT_REPETITIONS = 10; // former SLA: <1_000ms (100 events)
const QUERY_REPETITIONS = 100; // former SLAs: <15ms / <25ms / <15ms

interface Stats {
  readonly medianMs: number;
  readonly p95Ms: number;
}

function percentile(sortedMs: readonly number[], fraction: number): number {
  const index = Math.min(sortedMs.length - 1, Math.ceil(fraction * sortedMs.length) - 1);
  return sortedMs[Math.max(0, index)] ?? 0;
}

function summarize(samplesMs: readonly number[]): Stats {
  const sorted = samplesMs.toSorted((a, b) => a - b);
  return { medianMs: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95) };
}

function formatMs(ms: number): string {
  return ms < 0.001 ? '<0.001' : ms.toFixed(3);
}

function printStats(label: string, budgetHint: string, stats: Stats): void {
  console.log(
    `${label.padEnd(52)} median=${formatMs(stats.medianMs).padStart(10)}ms  ` +
      `p95=${formatMs(stats.p95Ms).padStart(10)}ms  (${budgetHint})`,
  );
}

async function benchInitialLoad(
  fixture: ReturnType<typeof generateQueryBenchmarkFixture>,
): Promise<Stats> {
  const samplesMs: number[] = [];
  for (let rep = 0; rep < LOAD_REPETITIONS; rep += 1) {
    const store = createInMemoryEventStore();
    const graphId = createGraphId();
    await store.appendEvents(graphId, fixture.events);

    const start = performance.now();
    const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
    const loadResult = await session.load();
    samplesMs.push(performance.now() - start);

    if (!loadResult.ok) throw new Error(`session.load() failed: ${loadResult.error.message}`);
    if (session.graph().nodes.size < 10_000) {
      throw new Error(`Expected >=10k nodes, got ${session.graph().nodes.size}`);
    }
  }
  return summarize(samplesMs);
}

async function benchSingleCommit(
  fixture: ReturnType<typeof generateQueryBenchmarkFixture>,
): Promise<Stats> {
  const store = createInMemoryEventStore();
  const graphId = createGraphId();
  await store.appendEvents(graphId, fixture.events);
  const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
  await session.load();

  const samplesMs: number[] = [];
  for (let rep = 0; rep < COMMIT_REPETITIONS; rep += 1) {
    const targetNodeId = fixture.sampleNodeIds[rep % fixture.sampleNodeIds.length];
    if (!targetNodeId) throw new Error('Expected sample node ID');
    const updateEvent: NodePropertiesUpdated = {
      type: 'NodePropertiesUpdated',
      eventId: createEventId(),
      id: targetNodeId,
      changes: new Map([['updatedProp', `single-update-value-${rep}`]]),
      timestamp: createInstant(),
      deviceId: SYSTEM_DEVICE_ID,
    };

    const start = performance.now();
    const commitResult = await session.commit([updateEvent]);
    samplesMs.push(performance.now() - start);
    if (!commitResult.ok) throw new Error(`session.commit() failed: ${commitResult.error.message}`);
  }
  return summarize(samplesMs);
}

async function benchBatchCommit(
  fixture: ReturnType<typeof generateQueryBenchmarkFixture>,
): Promise<Stats> {
  const store = createInMemoryEventStore();
  const graphId = createGraphId();
  await store.appendEvents(graphId, fixture.events);
  const session = createGraphSession(store, graphId, SYSTEM_DEVICE_ID);
  await session.load();

  const samplesMs: number[] = [];
  for (let rep = 0; rep < BATCH_COMMIT_REPETITIONS; rep += 1) {
    const batchEvents: readonly NodePropertiesUpdated[] = Array.from(
      { length: 100 },
      (_, index) => {
        const sampleNodeId =
          fixture.sampleNodeIds[(rep * 100 + index) % fixture.sampleNodeIds.length];
        if (!sampleNodeId) throw new Error('Expected sample node ID');
        return {
          type: 'NodePropertiesUpdated',
          eventId: createEventId(),
          id: sampleNodeId,
          changes: new Map([['batchProp', `batch-val-${rep}-${index}`]]),
          timestamp: createInstant(),
          deviceId: SYSTEM_DEVICE_ID,
        };
      },
    );

    const start = performance.now();
    const commitResult = await session.commit(batchEvents);
    samplesMs.push(performance.now() - start);
    if (!commitResult.ok) throw new Error(`session.commit() failed: ${commitResult.error.message}`);
  }
  return summarize(samplesMs);
}

function benchQuerySteps(fixture: ReturnType<typeof generateQueryBenchmarkFixture>): {
  readonly filter: Stats;
  readonly traversal: Stats;
  readonly sortLimitProject: Stats;
} {
  const filterSamplesMs: number[] = [];
  const traversalSamplesMs: number[] = [];
  const sortLimitProjectSamplesMs: number[] = [];

  for (let rep = 0; rep < QUERY_REPETITIONS; rep += 1) {
    let start = performance.now();
    const filterResult = executeQuery(fixture.graph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'filter', predicate: { property: 'category', operator: 'eq', value: 'cat_2' } },
      ],
    });
    filterSamplesMs.push(performance.now() - start);
    if (!filterResult.ok) throw new Error('node-scan+filter query failed');

    start = performance.now();
    const traversalResult = executeQuery(fixture.graph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'limit', limit: 100 },
        { kind: 'traversal', edgeType: fixture.sampleEdgeTypes[0], direction: 'out' },
      ],
    });
    traversalSamplesMs.push(performance.now() - start);
    if (!traversalResult.ok) throw new Error('traversal query failed');

    start = performance.now();
    const sortResult = executeQuery(fixture.graph, {
      steps: [
        { kind: 'node-scan', type: fixture.sampleNodeTypes[0] },
        { kind: 'sort', sort: { property: 'index', direction: 'desc' } },
        { kind: 'limit', limit: 50 },
        { kind: 'project', properties: ['category', 'index'] },
      ],
    });
    sortLimitProjectSamplesMs.push(performance.now() - start);
    if (!sortResult.ok) throw new Error('sort+limit+project query failed');
  }

  return {
    filter: summarize(filterSamplesMs),
    traversal: summarize(traversalSamplesMs),
    sortLimitProject: summarize(sortLimitProjectSamplesMs),
  };
}

async function main(): Promise<void> {
  const fixture = generateQueryBenchmarkFixture({
    nodeCount: 10_000,
    edgeDensity: 2,
    propertyCount: 4,
  });
  // Warm the read-model index cache `executeQuery` builds lazily per `Graph` reference (see
  // `getGraphIndexes` in @canopy/graph); `fixture.graph` starts with no `_indexes`, so without
  // this the first query benchmark below would pay a one-time O(V+E) build cost.
  executeQuery(fixture.graph, { steps: [{ kind: 'node-scan', type: fixture.sampleNodeTypes[0] }] });

  console.log(`\nGraphSession query projection benchmark (10k nodes, 20k edges)\n`);

  printStats(
    'Initial fold projection (session.load)',
    'former SLA <20000ms',
    await benchInitialLoad(fixture),
  );
  printStats(
    'Incremental re-projection (single commit)',
    'former SLA <250ms',
    await benchSingleCommit(fixture),
  );
  printStats(
    'Incremental re-projection (100-event batch commit)',
    'former SLA <1000ms',
    await benchBatchCommit(fixture),
  );

  const queryStats = benchQuerySteps(fixture);
  printStats('node-scan + filter', 'former SLA <15ms', queryStats.filter);
  printStats('1-hop traversal', 'former SLA <25ms', queryStats.traversal);
  printStats('sort + limit + project', 'former SLA <15ms', queryStats.sortLimitProject);
  console.log('');
}

await main();
