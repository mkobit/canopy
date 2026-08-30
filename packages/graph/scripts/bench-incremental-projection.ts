/**
 * Non-gating benchmark for incremental projection and merge state (canopy-v9o.1.2).
 *
 * Measures wall-clock performance (median, p95, and ratio between smallest and largest graph)
 * for `mergeEvents` in `incremental-projection.ts` on realistic graphs.
 *
 * Evaluates:
 * - Single-event incremental merge across 6 event kinds (NodeCreated, NodePropertiesUpdated,
 *   NodeDeleted, EdgeCreated, EdgePropertiesUpdated, EdgeDeleted).
 * - Out-of-order dependency resolution (parking on missing endpoints, draining on unblock).
 * - Chunk / batch merge of co-batched events.
 *
 * Run manually via `bun run packages/graph/scripts/bench-incremental-projection.ts` or
 * `bun run --cwd packages/graph bench:incremental-projection`.
 */
import {
  asDeviceId,
  asEdgeId,
  asInstant,
  asNodeId,
  asTypeId,
  createEventId,
  createGraphId,
  createMergeState,
  getGraphIndexes,
  mergeEvents,
  zeroRevision,
  type DeviceId,
  type Edge,
  type Graph,
  type GraphEvent,
  type MergeState,
  type Node,
  type PropertyValue,
} from '@canopy/graph';

const GRAPH_SIZES = [100, 1_000, 10_000, 50_000] as const;
const REPETITIONS = 150;
const NODE_TYPES = ['task', 'project', 'person', 'note', 'tag'] as const;
const EDGE_TYPES = [
  'belongs-to',
  'tagged-with',
  'blocks',
  'references',
  'assigned-to',
  'child-of',
] as const;
const EDGES_PER_NODE = 2.6;
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

function buildSeededGraphAndState(nodeCount: number): {
  readonly graph: Graph;
  readonly state: MergeState;
} {
  const nodes = new Map<ReturnType<typeof asNodeId>, Node>();
  const nodeMeta = new Map();

  for (let index = 0; index < nodeCount; index += 1) {
    const id = asNodeId(`bench-node-${index}`);
    const propWriters = new Map<string, ReturnType<typeof createEventId>>();
    propWriters.set('status', createEventId());
    propWriters.set('priority', createEventId());

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

    nodeMeta.set(id, {
      exists: true,
      tombstoned: false,
      propertyWriters: propWriters,
    });
  }

  const edgeCount = Math.round(nodeCount * EDGES_PER_NODE);
  const edges = new Map<ReturnType<typeof asEdgeId>, Edge>();
  const edgeMeta = new Map();

  for (let index = 0; index < edgeCount; index += 1) {
    const id = asEdgeId(`bench-edge-${index}`);
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

    edgeMeta.set(id, {
      exists: true,
      tombstoned: false,
      propertyWriters: new Map(),
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
    revision: zeroRevision(),
    nodes,
    edges,
  };

  getGraphIndexes(graph); // Pre-seed indexes

  const state: MergeState = {
    nodeMeta,
    edgeMeta,
    pendingGroups: new Map(),
    pendingByDependency: new Map(),
    nextPendingId: 0,
  };

  return { graph, state };
}

type EventKind =
  | 'NodeCreated'
  | 'NodePropertiesUpdated'
  | 'NodeDeleted'
  | 'EdgeCreated'
  | 'EdgePropertiesUpdated'
  | 'EdgeDeleted';

const EVENT_KINDS: readonly EventKind[] = [
  'NodeCreated',
  'NodePropertiesUpdated',
  'NodeDeleted',
  'EdgeCreated',
  'EdgePropertiesUpdated',
  'EdgeDeleted',
];

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
    case 'EdgePropertiesUpdated': {
      const targetIndex = repetition % graph.edges.size;
      return {
        type: 'EdgePropertiesUpdated',
        eventId: createEventId(),
        id: asEdgeId(`bench-edge-${targetIndex}`),
        changes: new Map<string, PropertyValue>([['weight', repetition]]),
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

function benchSingleEvents(
  graph: Graph,
  state: MergeState,
  kind: EventKind,
): Stats {
  const samplesMs: number[] = [];

  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    const event = probeEvent(graph, kind, repetition);
    const start = performance.now();
    mergeEvents(state, graph, [event]);
    samplesMs.push(performance.now() - start);
  }

  return summarize(samplesMs);
}

function benchDependencyDrain(
  graph: Graph,
  state: MergeState,
): Stats {
  const samplesMs: number[] = [];

  for (let repetition = 0; repetition < REPETITIONS; repetition += 1) {
    const targetNodeId = asNodeId(`unblock-node-${repetition}`);
    const edgeId = asEdgeId(`unblock-edge-${repetition}`);
    const sourceNodeId = asNodeId(`bench-node-${repetition % graph.nodes.size}`);

    // Edge arrives out of order (targetNodeId not yet created)
    const edgeEvent: GraphEvent = {
      type: 'EdgeCreated',
      eventId: createEventId(),
      id: edgeId,
      edgeType: asTypeId('belongs-to'),
      source: sourceNodeId,
      target: targetNodeId,
      properties: new Map(),
      timestamp: asInstant('2026-06-01T00:00:00Z'),
      deviceId: DEVICE_ID,
    };

    // Node arrives later and unblocks the edge
    const nodeEvent: GraphEvent = {
      type: 'NodeCreated',
      eventId: createEventId(),
      id: targetNodeId,
      nodeType: asTypeId('task'),
      properties: new Map(),
      timestamp: asInstant('2026-06-01T00:01:00Z'),
      deviceId: DEVICE_ID,
    };

    // Park edge in pending
    const intermediate = mergeEvents(state, graph, [edgeEvent]);

    // Measure unblock and drain step
    const start = performance.now();
    const result = mergeEvents(intermediate.state, intermediate.graph, [nodeEvent]);
    samplesMs.push(performance.now() - start);

    if (result.applied.length < 2) {
      throw new Error(`Expected edge to drain with node, applied: ${result.applied.length}`);
    }
  }

  return summarize(samplesMs);
}

function benchBatchMerge(
  graph: Graph,
  state: MergeState,
  batchSize: number,
): Stats {
  const samplesMs: number[] = [];

  for (let repetition = 0; repetition < Math.min(REPETITIONS, 50); repetition += 1) {
    const events: GraphEvent[] = [];
    const timestamp = asInstant('2026-06-01T00:00:00Z');

    for (let index = 0; index < batchSize; index += 1) {
      events.push({
        type: 'NodeCreated',
        eventId: createEventId(),
        id: asNodeId(`batch-node-${repetition}-${index}`),
        nodeType: asTypeId('task'),
        properties: new Map([['status', 'open']]),
        timestamp,
        deviceId: DEVICE_ID,
      });
    }

    const start = performance.now();
    mergeEvents(state, graph, events);
    samplesMs.push(performance.now() - start);
  }

  return summarize(samplesMs);
}

function formatMs(ms: number): string {
  return ms < 0.001 ? '<0.001' : ms.toFixed(3);
}

function main(): void {
  console.log(`\nIncremental projection benchmark (${REPETITIONS} reps/case)\n`);

  console.log('Single-event merge (median/p95 ms per call)');
  const header = `event                    | ${GRAPH_SIZES.map((n) => `           n=${n}`).join(' | ')}`;
  console.log(header);
  console.log('-'.repeat(header.length));

  const resultsByKind = new Map<EventKind, Stats[]>();

  for (const kind of EVENT_KINDS) {
    const row: string[] = [kind.padEnd(24)];
    const statsList: Stats[] = [];

    for (const size of GRAPH_SIZES) {
      const { graph, state } = buildSeededGraphAndState(size);
      const stats = benchSingleEvents(graph, state, kind);
      statsList.push(stats);
      row.push(`${formatMs(stats.medianMs)}/${formatMs(stats.p95Ms)}`.padStart(16));
    }

    resultsByKind.set(kind, statsList);
    console.log(row.join(' | '));
  }

  console.log('\nRatio (largest graph / smallest graph, median):');
  for (const kind of EVENT_KINDS) {
    const statsList = resultsByKind.get(kind);
    if (statsList && statsList.length >= 2) {
      const smallest = statsList[0]?.medianMs ?? 1;
      const largest = statsList[statsList.length - 1]?.medianMs ?? 1;
      const ratio = smallest > 0 ? largest / smallest : 0;
      console.log(`  ${kind.padEnd(24)} ${ratio.toFixed(2)}x`);
    }
  }

  console.log('\nOut-of-order unblock & drain (median/p95 ms per call)');
  console.log(header);
  console.log('-'.repeat(header.length));

  const drainRow: string[] = ['Park + Drain'.padEnd(24)];
  const drainStatsList: Stats[] = [];

  for (const size of GRAPH_SIZES) {
    const { graph, state } = buildSeededGraphAndState(size);
    const stats = benchDependencyDrain(graph, state);
    drainStatsList.push(stats);
    drainRow.push(`${formatMs(stats.medianMs)}/${formatMs(stats.p95Ms)}`.padStart(16));
  }
  console.log(drainRow.join(' | '));

  console.log('\nBatch merge (50 events/batch, median/p95 ms per call)');
  console.log(header);
  console.log('-'.repeat(header.length));

  const batchRow: string[] = ['Batch (50 events)'.padEnd(24)];
  for (const size of GRAPH_SIZES) {
    const { graph, state } = buildSeededGraphAndState(size);
    const stats = benchBatchMerge(graph, state, 50);
    batchRow.push(`${formatMs(stats.medianMs)}/${formatMs(stats.p95Ms)}`.padStart(16));
  }
  console.log(batchRow.join(' | '));
}

main();
