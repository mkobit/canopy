import { describe, it, expect } from 'bun:test';
import fc from 'fast-check';
import { Temporal } from 'temporal-polyfill';
import { mergeEvents, createMergeState } from './incremental-projection';
import { projectGraph } from './projection';
import { createGraph } from './create-graph';
import {
  createGraphId,
  createNodeId,
  createEdgeId,
  asTypeId,
  asDeviceId,
  asEventId,
  unwrap,
  type GraphEvent,
  type NodeId,
  type EdgeId,
  type EventId,
  type DeviceId,
} from '@canopy/graph';

const DEVICE_COUNT = 3;
const devices: readonly DeviceId[] = Array.from({ length: DEVICE_COUNT }, (_, i) =>
  asDeviceId(`00000000-0000-0000-0000-${String(i).padStart(12, '0')}`),
);

const BASE_EPOCH_MS = Temporal.Instant.from('2024-01-01T00:00:00Z').epochMilliseconds;

/**
 * Deterministic, monotonically-increasing eventId keyed purely by a step
 * counter -- avoids any dependency on real UUIDv7 generation or system-clock
 * mocking (see incremental-projection.test.ts for why that combination is
 * fragile: uuid v7 keeps its own monotonic ratchet that setSystemTime can't
 * rewind). Strict counter order here is exactly canonical (eventId) order.
 */
function syntheticEventId(counter: number): EventId {
  const epochMs = BASE_EPOCH_MS + counter;
  const hex = epochMs.toString(16).padStart(12, '0');
  return asEventId(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`);
}

/**
 * Temporal.Instant#toString() omits the millisecond fraction only when it's
 * exactly zero, which breaks plain string comparison between an
 * exact-whole-second instant and one a millisecond later ("...:00Z" sorts
 * after "...:00.001Z" lexicographically). Force a fixed 3-digit fraction so
 * synthetic timestamps compare correctly the same way lwwWins does.
 */
function syntheticTimestamp(counter: number): string {
  return Temporal.Instant.fromEpochMilliseconds(BASE_EPOCH_MS + counter).toString({
    fractionalSecondDigits: 3,
  });
}

type Step = Readonly<{
  kind: 'createNode' | 'updateNode' | 'deleteNode' | 'createEdge' | 'updateEdge' | 'deleteEdge';
  a: number;
  b: number;
  deviceIndex: number;
  propCount: number;
}>;

const stepArb: fc.Arbitrary<Step> = fc.record({
  kind: fc.constantFrom(
    'createNode',
    'updateNode',
    'deleteNode',
    'createEdge',
    'updateEdge',
    'deleteEdge',
  ),
  a: fc.nat(1000),
  b: fc.nat(1000),
  deviceIndex: fc.nat(DEVICE_COUNT - 1),
  propCount: fc.nat(3),
});

/**
 * Turns abstract steps into a valid GraphEvent stream: every reference
 * (edge endpoints, update/delete targets) resolves against entities already
 * live at that point in generation order, so the result is exactly the kind
 * of stream a real op layer would produce and canonical projectGraph can
 * fold without error. Steps whose precondition isn't met (e.g. updateNode
 * with nothing live yet) are silently skipped.
 */
function resolveSteps(steps: readonly Step[]): readonly GraphEvent[] {
  const events: GraphEvent[] = [];
  const liveNodes: NodeId[] = [];
  const liveEdges: EdgeId[] = [];
  const edgeEndpoints = new Map<EdgeId, Readonly<{ source: NodeId; target: NodeId }>>();
  let counter = 0;

  for (const step of steps) {
    const eventId = syntheticEventId(counter);
    const timestamp = syntheticTimestamp(counter) as GraphEvent['timestamp'];
    const deviceId = devices[step.deviceIndex % DEVICE_COUNT] ?? devices[0];
    if (deviceId === undefined) continue;

    if (step.kind === 'createNode') {
      const id = createNodeId();
      const properties = new Map(
        Array.from({ length: step.propCount }, (_, i) => [`prop${i}`, `v${counter}`] as const),
      );
      events.push({
        type: 'NodeCreated',
        eventId,
        id,
        nodeType: asTypeId('prop-test-node'),
        properties,
        timestamp,
        deviceId,
      });
      liveNodes.push(id);
      counter += 1;
      continue;
    }

    if (step.kind === 'updateNode') {
      if (liveNodes.length === 0) continue;
      const id = liveNodes[step.a % liveNodes.length];
      if (id === undefined) continue;
      events.push({
        type: 'NodePropertiesUpdated',
        eventId,
        id,
        changes: new Map([[`prop${step.b % 3}`, `v${counter}`]]),
        timestamp,
        deviceId,
      });
      counter += 1;
      continue;
    }

    if (step.kind === 'deleteNode') {
      if (liveNodes.length === 0) continue;
      const index = step.a % liveNodes.length;
      const id = liveNodes[index];
      if (id === undefined) continue;
      events.push({ type: 'NodeDeleted', eventId, id, timestamp, deviceId });
      liveNodes.splice(index, 1);
      // Cascade: canonical projection removes any edge touching a deleted
      // node, so those edge ids must stop being valid update/delete targets
      // too (referencing them would make canonical projectGraph error).
      for (let i = liveEdges.length - 1; i >= 0; i -= 1) {
        const edgeId = liveEdges[i];
        if (edgeId !== undefined) {
          const endpoints = edgeEndpoints.get(edgeId);
          if (endpoints && (endpoints.source === id || endpoints.target === id)) {
            liveEdges.splice(i, 1);
          }
        }
      }
      counter += 1;
      continue;
    }

    if (step.kind === 'createEdge') {
      if (liveNodes.length === 0) continue;
      const source = liveNodes[step.a % liveNodes.length];
      const target = liveNodes[step.b % liveNodes.length];
      if (source === undefined || target === undefined) continue;
      const id = createEdgeId();
      events.push({
        type: 'EdgeCreated',
        eventId,
        id,
        edgeType: asTypeId('prop-test-edge'),
        source,
        target,
        properties: new Map(),
        timestamp,
        deviceId,
      });
      liveEdges.push(id);
      edgeEndpoints.set(id, { source, target });
      counter += 1;
      continue;
    }

    if (step.kind === 'updateEdge') {
      if (liveEdges.length === 0) continue;
      const id = liveEdges[step.a % liveEdges.length];
      if (id === undefined) continue;
      events.push({
        type: 'EdgePropertiesUpdated',
        eventId,
        id,
        changes: new Map([[`prop${step.b % 3}`, `v${counter}`]]),
        timestamp,
        deviceId,
      });
      counter += 1;
      continue;
    }

    if (step.kind === 'deleteEdge') {
      if (liveEdges.length === 0) continue;
      const index = step.a % liveEdges.length;
      const id = liveEdges[index];
      if (id === undefined) continue;
      events.push({ type: 'EdgeDeleted', eventId, id, timestamp, deviceId });
      liveEdges.splice(index, 1);
      counter += 1;
    }
  }

  return events;
}

const MULBERRY32_INCREMENT = 0x6d_2b_79_f5;

/** Seeded Fisher-Yates shuffle (mulberry32 PRNG) -- deterministic per fast-check-provided seed. */
function seededShuffle<T>(items: readonly T[], seed: number): readonly T[] {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + MULBERRY32_INCREMENT) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };

  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    const a = result[i];
    const b = result[j];
    if (a === undefined || b === undefined) continue;
    result[i] = b;
    result[j] = a;
  }
  return result;
}

function partitionInto<T>(items: readonly T[], chunkCount: number): readonly (readonly T[])[] {
  if (items.length === 0) return [];
  const size = Math.max(1, Math.ceil(items.length / chunkCount));
  const chunks: (readonly T[])[] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

describe('incremental-projection / convergence property', () => {
  it('incremental(shuffle(E)) === projectGraph(sort(E)) for any permutation', () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 0, max: 0xff_ff_ff_ff }),
        (steps, seed) => {
          const events = resolveSteps(steps);
          if (events.length === 0) return;

          const initial = unwrap(createGraph(createGraphId(), 'prop-test'));
          const canonicalResult = projectGraph(events, initial);
          expect(canonicalResult.ok).toBe(true);
          if (!canonicalResult.ok) return;
          const canonical = canonicalResult.value;

          const shuffled = seededShuffle(events, seed);
          const state0 = createMergeState();
          const merged = mergeEvents(state0, initial, shuffled);

          expect(merged.graph).toEqual(canonical);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('converges across random partitions into sequential arrival chunks', () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 1, maxLength: 60 }),
        fc.integer({ min: 0, max: 0xff_ff_ff_ff }),
        fc.integer({ min: 1, max: 6 }),
        (steps, seed, chunkCount) => {
          const events = resolveSteps(steps);
          if (events.length === 0) return;

          const initial = unwrap(createGraph(createGraphId(), 'prop-test'));
          const canonicalResult = projectGraph(events, initial);
          expect(canonicalResult.ok).toBe(true);
          if (!canonicalResult.ok) return;
          const canonical = canonicalResult.value;

          const shuffled = seededShuffle(events, seed);
          const chunks = partitionInto(shuffled, chunkCount);

          let state = createMergeState();
          let graph = initial;
          for (const chunk of chunks) {
            const result = mergeEvents(state, graph, chunk);
            state = result.state;
            graph = result.graph;
          }

          expect(graph).toEqual(canonical);
        },
      ),
      { numRuns: 200 },
    );
  });
});
