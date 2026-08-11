import { describe, it, expect } from 'bun:test';
import fc from 'fast-check';
import {
  asDeviceId,
  asEdgeId,
  asInstant,
  asNodeId,
  asTypeId,
  createGraphId,
  type Edge,
  type Graph,
  type Node,
  type NodeId,
  type ScalarValue,
  zeroRevision,
} from '@canopy/graph';
import type { Filter, Operator, Query, QueryStep } from '../src/model';
import { executeQuery, executeQueryScanOnly } from '../src/engine';

/**
 * Small, deliberately-collision-prone pools: real graphs have far more nodes/edges than distinct
 * types/property values, and equality filters/traversals only exercise the index in a meaningful
 * way when random queries actually hit real data some of the time.
 */
const NODE_TYPES = ['task', 'project', 'person'] as const;
const EDGE_TYPES = ['belongs-to', 'tagged-with'] as const;
const PROP_NAMES = ['status', 'priority', 'flag'] as const;
/**
 * `null` and `ExternalReferenceValue` are deliberately excluded here -- see engine.ts's
 * `applyFilterIndexed` doc comment: the index-assisted eq-filter fast path never consults the
 * index for those value shapes (unwrap semantics diverge from index serialization), so they're
 * out of scope for this equivalence test, consistent with @canopy/graph's own indexes.test.ts.
 */
const PROP_VALUES: readonly ScalarValue[] = ['open', 'done', 'pending', 1, 2, 5, true, false];

const DEVICE_ID = asDeviceId('00000000-0000-0000-0000-00000000e001');

const propertiesArb: fc.Arbitrary<ReadonlyMap<string, ScalarValue>> = fc
  .tuple(
    ...PROP_NAMES.map((name) =>
      fc
        .option(fc.constantFrom(...PROP_VALUES), { nil: undefined })
        .map((value) => [name, value] as const),
    ),
  )
  .map((pairs) => {
    const entries = pairs.filter(
      (pair): pair is readonly [(typeof PROP_NAMES)[number], ScalarValue] => pair[1] !== undefined,
    );
    return new Map<string, ScalarValue>(entries);
  });

function makeNode(index: number, type: string, properties: ReadonlyMap<string, ScalarValue>): Node {
  return {
    id: asNodeId(`node-${index}`),
    type: asTypeId(type),
    properties,
    metadata: {
      created: asInstant('2026-01-01T00:00:00Z'),
      modified: asInstant('2026-01-01T00:00:00Z'),
      modifiedBy: DEVICE_ID,
    },
  };
}

function makeEdge(index: number, type: string, source: NodeId, target: NodeId): Edge {
  return {
    id: asEdgeId(`edge-${index}`),
    type: asTypeId(type),
    source,
    target,
    properties: new Map(),
    metadata: {
      created: asInstant('2026-01-01T00:00:00Z'),
      modified: asInstant('2026-01-01T00:00:00Z'),
      modifiedBy: DEVICE_ID,
    },
  };
}

const graphArb: fc.Arbitrary<Graph> = fc
  .record({
    nodeSpecs: fc.array(
      fc.record({ type: fc.constantFrom(...NODE_TYPES), properties: propertiesArb }),
      { minLength: 0, maxLength: 30 },
    ),
    edgeSpecs: fc.array(
      fc.record({
        type: fc.constantFrom(...EDGE_TYPES),
        sourceIndex: fc.nat(999),
        targetIndex: fc.nat(999),
      }),
      { minLength: 0, maxLength: 30 },
    ),
  })
  .map(({ nodeSpecs, edgeSpecs }) => {
    const nodeList = nodeSpecs.map((spec, index) => makeNode(index, spec.type, spec.properties));
    const nodes = new Map(nodeList.map((node) => [node.id, node]));

    const edgeList =
      nodeList.length === 0
        ? []
        : edgeSpecs.map((spec, index) =>
            makeEdge(
              index,
              spec.type,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- modulo against a known-nonempty array
              nodeList[spec.sourceIndex % nodeList.length]!.id,
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- modulo against a known-nonempty array
              nodeList[spec.targetIndex % nodeList.length]!.id,
            ),
          );
    const edges = new Map(edgeList.map((edge) => [edge.id, edge]));

    return {
      id: createGraphId(),
      name: 'prop-test',
      metadata: {
        created: asInstant('2026-01-01T00:00:00Z'),
        modified: asInstant('2026-01-01T00:00:00Z'),
        modifiedBy: DEVICE_ID,
      },
      revision: zeroRevision(),
      nodes,
      edges,
    };
  });

const NODE_FILTER_OPERATORS: readonly Operator[] = [
  'eq',
  'neq',
  'gt',
  'lt',
  'contains',
  'starts-with',
  'exists',
];

const filterStepArb: fc.Arbitrary<QueryStep> = fc
  .record({
    property: fc.constantFrom(...PROP_NAMES),
    operator: fc.constantFrom(...NODE_FILTER_OPERATORS),
    value: fc.constantFrom(...PROP_VALUES),
  })
  .map((predicate: Filter): QueryStep => ({
    kind: 'filter',
    predicate,
  }));

const traversalStepArb: fc.Arbitrary<QueryStep> = fc
  .record({
    edgeType: fc.option(fc.constantFrom(...EDGE_TYPES), { nil: undefined }),
    direction: fc.constantFrom('out', 'in', 'both'),
  })
  .map(({ edgeType, direction }): QueryStep => ({
    kind: 'traversal',
    edgeType,
    direction,
  }));

const nodeQueryArb: fc.Arbitrary<Query> = fc
  .record({
    type: fc.option(fc.constantFrom(...NODE_TYPES), { nil: undefined }),
    steps: fc.array(fc.oneof(filterStepArb, traversalStepArb), { maxLength: 4 }),
  })
  .map(({ type, steps }) => ({
    steps: [{ kind: 'node-scan' as const, type }, ...steps],
  }));

const edgeQueryArb: fc.Arbitrary<Query> = fc
  .record({
    type: fc.option(fc.constantFrom(...EDGE_TYPES), { nil: undefined }),
    filters: fc.array(filterStepArb, { maxLength: 3 }),
  })
  .map(({ type, filters }) => ({
    steps: [{ kind: 'edge-scan' as const, type }, ...filters],
  }));

const queryArb: fc.Arbitrary<Query> = fc.oneof(nodeQueryArb, edgeQueryArb);

function sortedIds(items: readonly (Node | Edge)[]): readonly string[] {
  return items.map((item) => item.id).toSorted((a, b) => a.localeCompare(b));
}

function sortedById<T extends Node | Edge>(items: readonly T[]): readonly T[] {
  return items.toSorted((a, b) => a.id.localeCompare(b.id));
}

describe('executeQuery / executeQueryScanOnly equivalence', () => {
  it('indexed and scan-only execution return equal result sets for random graphs and queries', () => {
    fc.assert(
      fc.property(graphArb, queryArb, (graph, query) => {
        const indexed = executeQuery(graph, query);
        const scanned = executeQueryScanOnly(graph, query);

        expect(indexed.ok).toBe(scanned.ok);
        if (!indexed.ok || !scanned.ok) return;

        expect(sortedIds(indexed.value.nodes)).toEqual(sortedIds(scanned.value.nodes));
        expect(sortedIds(indexed.value.edges)).toEqual(sortedIds(scanned.value.edges));
        // Same graph, same ids -> same object references, so full deep equality is a free extra check.
        expect(sortedById(indexed.value.nodes)).toEqual(sortedById(scanned.value.nodes));
        expect(sortedById(indexed.value.edges)).toEqual(sortedById(scanned.value.edges));
      }),
      { numRuns: 300 },
    );
  });
});
