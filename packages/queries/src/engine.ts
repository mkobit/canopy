import type {
  Graph,
  Node,
  Edge,
  NodeId,
  QueryResult,
  PropertyValue,
  ReadModelPort,
  Result,
  ScalarValue,
} from '@canopy/graph';
import { ok, err, asTypeId, createIndexedReadModel } from '@canopy/graph';
import type { Query, Filter, Sort, QueryStep } from './model';
import { reduce, filter, unique, flatMap, map } from 'remeda';

type GraphItem = Node | Edge;

// Helper to accumulate results with error handling in reduce
interface Accumulator {
  readonly items: readonly GraphItem[];
  readonly isNodeContext: boolean;
  readonly error?: Error;
  readonly rows?: readonly Readonly<Record<string, unknown>>[];
}

export function executeQuery(graph: Graph, query: Query): Result<QueryResult, Error> {
  // We need to keep track of isNodeContext which changes based on steps.
  // reduce is suitable here.
  const initial: Accumulator = { items: [], isNodeContext: false };
  const readModel = createIndexedReadModel(graph);

  const result = reduce(
    query.steps,
    (accumulator, step: QueryStep): Accumulator => {
      if (accumulator.error) return accumulator; // Propagate error

      switch (step.kind) {
        case 'node-scan': {
          return {
            items: step.type ? scanNodesIndexed(readModel, graph, step.type) : scanNodes(graph),
            isNodeContext: true,
          };
        }
        case 'edge-scan': {
          return {
            items: scanEdges(graph, step.type),
            isNodeContext: false,
          };
        }
        case 'filter': {
          return {
            ...accumulator,
            items: applyFilterIndexed(
              readModel,
              accumulator.items,
              accumulator.isNodeContext,
              step.predicate,
            ),
          };
        }
        case 'traversal': {
          if (!accumulator.isNodeContext) {
            return {
              ...accumulator,
              error: new Error('Traversal can only be performed on nodes.'),
            };
          }
          return {
            items: traverseIndexed(
              readModel,
              graph,
              accumulator.items as readonly Node[],
              step.edgeType,
              step.direction,
            ),
            isNodeContext: true, // Traversal returns nodes
          };
        }
        case 'sort': {
          return {
            ...accumulator,
            items: applySort(accumulator.items, step.sort),
          };
        }
        case 'limit': {
          return {
            ...accumulator,
            items: accumulator.items.slice(0, step.limit),
          };
        }
        case 'project': {
          const rows = map(accumulator.items, (item) => {
            return reduce(
              step.properties,
              (row, property) => {
                return { ...row, [property]: getItemFieldValue(item, property) };
              },
              {} as Readonly<Record<string, unknown>>,
            );
          });
          return {
            ...accumulator,
            rows,
          };
        }
        default: {
          return accumulator;
        }
      }
    },
    initial,
  );

  if (result.error) {
    return err(result.error);
  }

  const baseResult = result.isNodeContext
    ? { nodes: result.items as readonly Node[], edges: [] }
    : { nodes: [], edges: result.items as readonly Edge[] };

  return ok(result.rows === undefined ? baseResult : { ...baseResult, rows: result.rows });
}

/**
 * Reference oracle for the scan-vs-index equivalence property test (design.md Decision 7):
 * identical step handling to `executeQuery`, but never consults the read model -- every step
 * scans `graph.nodes`/`graph.edges` directly. Deliberately a standalone copy of the reduce loop
 * rather than derived from `executeQuery`, so a bug shared by both wouldn't be masked; the two are
 * kept in lockstep only by the property test that compares their output on random graphs/queries.
 */
export function executeQueryScanOnly(graph: Graph, query: Query): Result<QueryResult, Error> {
  const initial: Accumulator = { items: [], isNodeContext: false };

  const result = reduce(
    query.steps,
    (accumulator, step: QueryStep): Accumulator => {
      if (accumulator.error) return accumulator;

      switch (step.kind) {
        case 'node-scan': {
          return { items: scanNodes(graph, step.type), isNodeContext: true };
        }
        case 'edge-scan': {
          return { items: scanEdges(graph, step.type), isNodeContext: false };
        }
        case 'filter': {
          return { ...accumulator, items: applyFilter(accumulator.items, step.predicate) };
        }
        case 'traversal': {
          if (!accumulator.isNodeContext) {
            return {
              ...accumulator,
              error: new Error('Traversal can only be performed on nodes.'),
            };
          }
          return {
            items: traverse(
              graph,
              accumulator.items as readonly Node[],
              step.edgeType,
              step.direction,
            ),
            isNodeContext: true,
          };
        }
        case 'sort': {
          return { ...accumulator, items: applySort(accumulator.items, step.sort) };
        }
        case 'limit': {
          return { ...accumulator, items: accumulator.items.slice(0, step.limit) };
        }
        case 'project': {
          const rows = map(accumulator.items, (item) =>
            reduce(
              step.properties,
              (row, property) => ({ ...row, [property]: getItemFieldValue(item, property) }),
              {} as Readonly<Record<string, unknown>>,
            ),
          );
          return { ...accumulator, rows };
        }
        default: {
          return accumulator;
        }
      }
    },
    initial,
  );

  if (result.error) {
    return err(result.error);
  }

  const baseResult = result.isNodeContext
    ? { nodes: result.items as readonly Node[], edges: [] }
    : { nodes: [], edges: result.items as readonly Edge[] };

  return ok(result.rows === undefined ? baseResult : { ...baseResult, rows: result.rows });
}

function scanNodes(graph: Graph, type?: string): readonly Node[] {
  const nodes = [...graph.nodes.values()];
  if (!type) return nodes;
  return filter(nodes, (node) => node.type === type);
}

/** Resolves a `node-scan` by type through the read model's type index instead of a full scan. */
function scanNodesIndexed(readModel: ReadModelPort, graph: Graph, type: string): readonly Node[] {
  return resolveNodeIds(graph, readModel.typedNodeIds(asTypeId(type)));
}

function scanEdges(graph: Graph, type?: string): readonly Edge[] {
  const edges = [...graph.edges.values()];
  if (!type) return edges;
  return filter(edges, (edge) => edge.type === type);
}

function resolveNodeIds(graph: Graph, ids: Iterable<NodeId>): readonly Node[] {
  return [...ids]
    .map((id) => graph.nodes.get(id))
    .filter((node): node is Node => node !== undefined);
}

/**
 * Resolves a `traversal` step through the read model's adjacency index instead of scanning every
 * edge once per hop. Semantically identical to `traverse` below (same per-node out/in/both union,
 * same edge-type narrowing, same dedup-by-id), just sourced from the index.
 */
function traverseIndexed(
  readModel: ReadModelPort,
  graph: Graph,
  nodes: readonly Node[],
  edgeType: string | undefined,
  direction: 'out' | 'in' | 'both',
): readonly Node[] {
  const typeId = edgeType ? asTypeId(edgeType) : undefined;
  const neighbourIds = new Set(
    flatMap(nodes, (node) => [...readModel.neighbours(node.id, typeId, direction)]),
  );
  return resolveNodeIds(graph, neighbourIds);
}

/**
 * Resolves an equality `filter` step on node items through the read model's property-equality
 * index, falling back to `applyFilter` for anything the index can't answer: non-`eq` operators,
 * edge items (only node properties are indexed), and values that aren't a plain scalar (`null`
 * and `ExternalReferenceValue` unwrap differently than they're indexed -- see `unwrapScalar`).
 * The index result is a narrowing pre-filter, not a final arbiter: `applyFilter` re-verifies every
 * candidate, so an index/scan serialization mismatch (e.g. `NaN` self-equality) can only produce a
 * false *negative* pre-filter, never a wrong final result.
 */
function applyFilterIndexed(
  readModel: ReadModelPort,
  items: readonly GraphItem[],
  isNodeContext: boolean,
  predicate: Filter,
): readonly GraphItem[] {
  if (!isNodeContext || predicate.operator !== 'eq') {
    return applyFilter(items, predicate);
  }
  const { value } = predicate;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return applyFilter(items, predicate);
  }
  // isNodeContext guarantees `items` are Node[] here -- same invariant the 'traversal' case above
  // relies on when it casts accumulator.items to readonly Node[].
  const nodes = items as readonly Node[];
  const candidateIds = new Set(readModel.nodesWhereEquals(predicate.property, value));
  const candidates = filter(nodes, (node) => candidateIds.has(node.id));
  return applyFilter(candidates, predicate);
}

function applyFilter(items: readonly GraphItem[], predicate: Filter): readonly GraphItem[] {
  return filter(items, (item) => {
    // Let's try a different approach to avoid `let`.
    // We can use a helper function to extract value.
    const getPropertyValue = (): unknown => {
      if ('source' in item && predicate.property === 'source') return item.source;
      if ('target' in item && predicate.property === 'target') return item.target;

      const property = item.properties.get(predicate.property);
      if (property !== undefined) return unwrapValue(property);
      return undefined;
    };

    const pValue = getPropertyValue();
    if (pValue === undefined) {
      if (predicate.operator === 'exists') return false;
      return false;
    }

    const value = predicate.value;

    switch (predicate.operator) {
      case 'eq': {
        return pValue === value;
      }
      case 'neq': {
        return pValue !== value;
      }
      case 'gt': {
        return compare(pValue, value) > 0;
      }
      case 'gte': {
        return compare(pValue, value) >= 0;
      }
      case 'lt': {
        return compare(pValue, value) < 0;
      }
      case 'lte': {
        return compare(pValue, value) <= 0;
      }
      case 'contains': {
        if (Array.isArray(pValue)) {
          return pValue.includes(value);
        }
        if (typeof pValue === 'string') {
          return pValue.includes(value as string);
        }
        return false;
      }
      case 'starts-with': {
        if (typeof pValue === 'string' && typeof value === 'string') {
          return pValue.startsWith(value);
        }
        return false;
      }
      case 'ends-with': {
        if (typeof pValue === 'string' && typeof value === 'string') {
          return pValue.endsWith(value);
        }
        return false;
      }
      case 'exists': {
        return pValue !== undefined && pValue !== null;
      }
      default: {
        return false;
      }
    }
  });
}

function traverse(
  graph: Graph,
  nodes: readonly Node[],
  edgeType: string | undefined,
  direction: 'out' | 'in' | 'both',
): readonly Node[] {
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Get all edges that match the criteria
  const edges = [...graph.edges.values()];

  return unique(
    flatMap(edges, (edge: Edge) => {
      if (edgeType && edge.type !== edgeType) return [];

      const isSourceMatches = nodeIds.has(edge.source);
      const isTargetMatches = nodeIds.has(edge.target);

      const targetNode = graph.nodes.get(edge.target);
      const sourceNode = graph.nodes.get(edge.source);
      switch (direction) {
        case 'out': {
          return isSourceMatches && targetNode ? [targetNode] : [];
        }
        case 'in': {
          return isTargetMatches && sourceNode ? [sourceNode] : [];
        }
        case 'both': {
          return [
            ...(isSourceMatches && targetNode ? [targetNode] : []),
            ...(isTargetMatches && sourceNode ? [sourceNode] : []),
          ];
        }
        default: {
          return [];
        }
      }
    }),
  );
}

function getItemFieldValue(item: GraphItem, property: string): unknown {
  if (property === 'type') return item.type;
  if (property.startsWith('metadata.')) {
    const metaKey = property.slice('metadata.'.length) as keyof typeof item.metadata;
    return item.metadata[metaKey];
  }
  return unwrapValue(item.properties.get(property));
}

function applySort(items: readonly GraphItem[], sort: Sort): readonly GraphItem[] {
  return items.toSorted((a, b) => {
    const valueA = getItemFieldValue(a, sort.property);
    const valueB = getItemFieldValue(b, sort.property);

    if (valueA === valueB) return 0;
    if (valueA === undefined) return 1; // undefined last
    if (valueB === undefined) return -1;

    const comparison = compare(valueA, valueB);
    return sort.direction === 'asc' ? comparison : -comparison;
  });
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'string' && typeof b === 'string') {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return a === b ? 0 : a ? 1 : -1;
  }
  // Incomparable or mixed types treat as equal for sorting stability or specific ordering?
  // Let's rely on string representation fallback or just return 0
  return 0;
}

function unwrapValue(property: PropertyValue | undefined): unknown {
  if (property === undefined) return undefined;
  if (Array.isArray(property)) {
    return property.map(unwrapScalar);
  }
  // Explicitly tell TS that prop is ScalarValue here
  return unwrapScalar(property as ScalarValue);
}

function unwrapScalar(scalar: ScalarValue): unknown {
  if (scalar === null) return undefined;
  if (typeof scalar === 'object') {
    // ExternalReferenceValue check
    if ('graph' in scalar && 'target' in scalar) {
      return `${scalar.graph}://${scalar.target}`;
    }
    // Any other object? No other objects in ScalarValue union.
    return scalar;
  }
  return scalar;
}
