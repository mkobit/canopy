/**
 * Non-gating benchmark for read-model index maintenance (canopy-c54.5).
 *
 * `indexes.test.ts`'s "maintenance cost regression" suite proves determinstically -- via
 * reference-identity checks on *unrelated* buckets -- that a single event never triggers a full
 * O(V+E) graph rescan. That fixture uses one node per type, so every touched bucket in that test is
 * empty before the touch; it does not exercise the cost of growing an existing, populated bucket.
 * This script fills that gap: real wall-clock numbers (median, p95, and the ratio between the
 * smallest and largest graph) on a graph shaped like a real vault -- a handful of node/edge types
 * shared by thousands of nodes, so type/adjacency/property-equality buckets are actually large.
 *
 * It reports TWO measurements per event, deliberately kept separate:
 * - "full applyEvent": the whole write path, which also clones `graph.nodes`/`graph.edges`
 *   (design.md's already-accepted O(n)/event Map-clone cost -- unrelated to index maintenance).
 * - "index-only": `incrementalUpdateIndexes` called in isolation on the same before/after graph
 *   pair, isolating index maintenance from that surrounding clone cost.
 *
 * Empirically, the index-only ratio does NOT stay flat across graph sizes here (see the numbers
 * this script prints -- consistently in the hundreds of times slower from 100 to 50,000 nodes,
 * scaling with the size of the specific bucket touched). Root cause: `addToSet`/`removeFromSet` in
 * indexes.ts do a full copy-on-write `new Set(existingBucket)` before mutating, so "O(delta)" here
 * means "one entry changes, no unrelated bucket is touched" (true, and what the regression test
 * proves), not "O(1) regardless of bucket size" (not true for a bucket most nodes share, e.g. a
 * common type or a common property value). design.md's adversarial review already names this
 * exact risk ("Immutability copy cost compounding") and its accepted mitigation ("do not attempt
 * persistent/HAMT maps in this change... file a follow-on if write throughput ever becomes the
 * bottleneck") -- this script's numbers are the evidence that mitigation asked for. Not wired into
 * `bun test` or CI -- run manually via `bun run packages/graph/scripts/bench-index-maintenance.ts`.
 */
import {
  applyEvent,
  asDeviceId,
  asEdgeId,
  asInstant,
  asNodeId,
  asTypeId,
  createEventId,
  createGraphId,
  getGraphIndexes,
  incrementalUpdateIndexes,
  type DeviceId,
  type Edge,
  type Graph,
  type GraphEvent,
  type Node,
  type PropertyValue,
} from '@canopy/graph';

const GRAPH_SIZES = [100, 1_000, 10_000, 50_000] as const;
const REPETITIONS = 200;
const NODE_TYPES = ['task', 'project', 'person', 'note', 'tag'] as const;
const EDGE_TYPES = [
  'belongs-to',
  'tagged-with',
  'blocks',
  'references',
  'assigned-to',
  'child-of',
] as const;
const EDGES_PER_NODE = 2.6; // matches the epic's original scan-vs-index benchmark methodology
const DEVICE_ID: DeviceId = asDeviceId('00000000-0000-0000-0000-0000bee00001');

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

/** Builds a graph of `nodeCount` nodes and ~`EDGES_PER_NODE` edges/node, seeded with `_indexes`. */
function buildSeededGraph(nodeCount: number): Graph {
  const nodes = new Map<ReturnType<typeof asNodeId>, Node>();
  for (let index = 0; index < nodeCount; index += 1) {
    const id = asNodeId(`bench-node-${index}`);
    nodes.set(id, {
      id,
      type: asTypeId(NODE_TYPES[index % NODE_TYPES.length] ?? 'task'),
      properties: new Map<string, PropertyValue>([
        ['status', index % 2 === 0 ? 'open' : 'done'],
        ['priority', index % 5],
      ]),
      metadata: {
        created: asInstant('2026-01-01T00:00:00Z'),
        modified: asInstant('2026-01-01T00:00:00Z'),
        modifiedBy: DEVICE_ID,
      },
    });
  }

  const edgeCount = Math.round(nodeCount * EDGES_PER_NODE);
  const edges = new Map<ReturnType<typeof asEdgeId>, Edge>();
  for (let index = 0; index < edgeCount; index += 1) {
    const id = asEdgeId(`bench-edge-${index}`);
    // Deterministic pseudo-random spread so adjacency buckets vary in size, not a uniform chain.
    const sourceIndex = (index * 2654435761) % nodeCount;
    const targetIndex = (index * 40503 + 7) % nodeCount;
    edges.set(id, {
      id,
      type: asTypeId(EDGE_TYPES[index % EDGE_TYPES.length] ?? 'belongs-to'),
      source: asNodeId(`bench-node-${sourceIndex}`),
      target: asNodeId(`bench-node-${targetIndex}`),
      properties: new Map(),
      metadata: {
        created: asInstant('2026-01-01T00:00:00Z'),
        modified: asInstant('2026-01-01T00:00:00Z'),
        modifiedBy: DEVICE_ID,
      },
    });
  }

  const graph: Graph = {
    id: createGraphId(),
    name: `bench-${nodeCount}`,
    metadata: {
      created: asInstant('2026-01-01T00:00:00Z'),
      modified: asInstant('2026-01-01T00:00:00Z'),
      modifiedBy: DEVICE_ID,
    },
    nodes,
    edges,
  };
  getGraphIndexes(graph); // seed graph._indexes so applyEvent maintains it incrementally, not via a first-touch rebuild
  return graph;
}

/** One probe event per repetition, applied fresh against the pristine seeded graph each time. */
function probeEvent(graph: Graph, kind: EventKind, repetition: number): GraphEvent {
  const timestamp = asInstant('2026-06-01T00:00:00Z');
  switch (kind) {
    case 'NodeCreated': {
      return {
        type: 'NodeCreated',
        eventId: createEventId(),
        id: asNodeId(`probe-node-${repetition}`),
        nodeType: asTypeId('task'),
        properties: new Map<string, PropertyValue>([['status', 'open']]),
        timestamp,
        deviceId: DEVICE_ID,
      };
    }
    case 'NodePropertiesUpdated': {
      const targetIndex = repetition % graph.nodes.size;
      // A per-repetition-unique value guarantees a real property-equality bucket move every time
      // -- 'open'/'done' would make ~half the repetitions a same-value no-op (seeded status
      // alternates by index), silently pulling the median down instead of measuring maintenance.
      return {
        type: 'NodePropertiesUpdated',
        eventId: createEventId(),
        id: asNodeId(`bench-node-${targetIndex}`),
        changes: new Map<string, PropertyValue>([['status', `probe-status-${repetition}`]]),
        timestamp,
        deviceId: DEVICE_ID,
      };
    }
    case 'NodeDeleted': {
      const targetIndex = repetition % graph.nodes.size;
      return {
        type: 'NodeDeleted',
        eventId: createEventId(),
        id: asNodeId(`bench-node-${targetIndex}`),
        timestamp,
        deviceId: DEVICE_ID,
      };
    }
    case 'EdgeCreated': {
      const sourceIndex = repetition % graph.nodes.size;
      const targetIndex = (repetition + 1) % graph.nodes.size;
      return {
        type: 'EdgeCreated',
        eventId: createEventId(),
        id: asEdgeId(`probe-edge-${repetition}`),
        edgeType: asTypeId('belongs-to'),
        source: asNodeId(`bench-node-${sourceIndex}`),
        target: asNodeId(`bench-node-${targetIndex}`),
        properties: new Map(),
        timestamp,
        deviceId: DEVICE_ID,
      };
    }
    case 'EdgeDeleted': {
      const targetIndex = repetition % graph.edges.size;
      return {
        type: 'EdgeDeleted',
        eventId: createEventId(),
        id: asEdgeId(`bench-edge-${targetIndex}`),
        timestamp,
        deviceId: DEVICE_ID,
      };
    }
  }
}

type EventKind =
  'NodeCreated' | 'NodePropertiesUpdated' | 'NodeDeleted' | 'EdgeCreated' | 'EdgeDeleted';
const EVENT_KINDS: readonly EventKind[] = [
  'NodeCreated',
  'NodePropertiesUpdated',
  'NodeDeleted',
  'EdgeCreated',
  'EdgeDeleted',
];

interface KindStats {
  readonly applyEvent: Stats;
  readonly indexOnly: Stats;
}

function benchEventKind(graph: Graph, kind: EventKind): KindStats {
  const applySamplesMs: number[] = [];
  const indexOnlySamplesMs: number[] = [];
  const previousIndexes = getGraphIndexes(graph); // already seeded; O(1) cache hit, not a rebuild

  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    const event = probeEvent(graph, kind, repetition);

    const applyStart = performance.now();
    const result = applyEvent(graph, event); // always applied against the pristine seeded graph
    applySamplesMs.push(performance.now() - applyStart);
    if (!result.ok) throw new Error(`applyEvent(${kind}) failed: ${result.error.message}`);
    const nextGraph = result.value;

    const indexStart = performance.now();
    incrementalUpdateIndexes(previousIndexes, event, graph, nextGraph);
    indexOnlySamplesMs.push(performance.now() - indexStart);
  }

  return { applyEvent: summarize(applySamplesMs), indexOnly: summarize(indexOnlySamplesMs) };
}

interface Row {
  readonly nodeCount: number;
  readonly kind: EventKind;
  readonly stats: KindStats;
}

function formatMs(ms: number): string {
  return ms < 0.001 ? '<0.001' : ms.toFixed(3);
}

function printSection(
  title: string,
  rows: readonly Row[],
  pick: (stats: KindStats) => Stats,
): void {
  console.log(`\n${title} (median/p95 ms per call)\n`);
  console.log(
    'event                    | ' + GRAPH_SIZES.map((n) => `n=${n}`.padStart(16)).join(' | '),
  );
  console.log('-'.repeat(26 + GRAPH_SIZES.length * 19));

  for (const kind of EVENT_KINDS) {
    const byNodeCount = new Map(
      rows.filter((r) => r.kind === kind).map((r) => [r.nodeCount, pick(r.stats)]),
    );
    const cells = GRAPH_SIZES.map((nodeCount) => {
      const stats = byNodeCount.get(nodeCount);
      return stats
        ? `${formatMs(stats.medianMs)}/${formatMs(stats.p95Ms)}`.padStart(16)
        : 'n/a'.padStart(16);
    });
    console.log(`${kind.padEnd(24)} | ${cells.join(' | ')}`);
  }

  console.log('\nratio (largest graph / smallest graph, median):');
  const smallest = GRAPH_SIZES[0];
  const largest = GRAPH_SIZES.at(-1);
  for (const kind of EVENT_KINDS) {
    const small = rows.find((r) => r.kind === kind && r.nodeCount === smallest);
    const large = rows.find((r) => r.kind === kind && r.nodeCount === largest);
    if (!small || !large) continue;
    const smallMedian = pick(small.stats).medianMs;
    const largeMedian = pick(large.stats).medianMs;
    if (smallMedian === 0) continue;
    console.log(`  ${kind.padEnd(24)} ${(largeMedian / smallMedian).toFixed(2)}x`);
  }
}

function printReport(rows: readonly Row[]): void {
  console.log(`\nRead-model index maintenance benchmark (${REPETITIONS} reps/case)`);
  printSection(
    'Full applyEvent (includes the accepted O(n)/event graph Map-clone cost)',
    rows,
    (s) => s.applyEvent,
  );
  printSection('Index-only: incrementalUpdateIndexes in isolation', rows, (s) => s.indexOnly);
  console.log(
    '\nIndex-only ratios above scale with graph size (not flat) because addToSet/removeFromSet copy the\n' +
      "whole affected bucket on write -- see this file's header comment for the root cause and the\n" +
      'design.md-accepted mitigation path (structural-sharing maps, if this ever becomes the bottleneck).\n',
  );
}

function main(): void {
  const rows: Row[] = [];
  for (const nodeCount of GRAPH_SIZES) {
    const graph = buildSeededGraph(nodeCount);
    for (const kind of EVENT_KINDS) {
      rows.push({ nodeCount, kind, stats: benchEventKind(graph, kind) });
    }
  }
  printReport(rows);
}

main();
