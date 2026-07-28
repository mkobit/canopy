import type {
  Graph,
  Node,
  Edge,
  QueryResult,
  PropertyValue,
  Result,
  ScalarValue,
} from '@canopy/graph';
import { ok, err } from '@canopy/graph';
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

  const result = reduce(
    query.steps,
    (accumulator, step: QueryStep): Accumulator => {
      if (accumulator.error) return accumulator; // Propagate error

      switch (step.kind) {
        case 'node-scan': {
          return {
            items: scanNodes(graph, step.type),
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
            items: applyFilter(accumulator.items, step.predicate),
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
            items: traverse(
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

function scanNodes(graph: Graph, type?: string): readonly Node[] {
  const nodes = [...graph.nodes.values()];
  if (!type) return nodes;
  return filter(nodes, (node) => node.type === type);
}

function scanEdges(graph: Graph, type?: string): readonly Edge[] {
  const edges = [...graph.edges.values()];
  if (!type) return edges;
  return filter(edges, (edge) => edge.type === type);
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
