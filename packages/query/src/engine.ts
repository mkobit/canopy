import type { Graph, Node, Edge, QueryResult, PropertyValue, Result } from '@canopy/types';
import { ok, err } from '@canopy/types';
import type { Query, Filter, Sort, QueryStep } from './model';
import { reduce, filter, unique, flatMap } from 'remeda';

type GraphItem = Node | Edge;

// Helper to accumulate results with error handling in reduce
interface Accumulator {
  readonly items: readonly GraphItem[];
  readonly isNodeContext: boolean;
  readonly error?: Error;
}

export function executeQuery(graph: Graph, query: Query): Result<QueryResult, Error> {
  // We need to keep track of isNodeContext which changes based on steps.
  // reduce is suitable here.
  const initial: Accumulator = { items: [], isNodeContext: false };

  const result = reduce(
    query.steps,
    (acc, step: QueryStep): Accumulator => {
      if (acc.error) return acc; // Propagate error

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
            ...acc,
            items: applyFilter(acc.items, step.predicate),
          };
        }
        case 'traversal': {
          if (!acc.isNodeContext) {
            return { ...acc, error: new Error('Traversal can only be performed on nodes.') };
          }
          return {
            items: traverse(graph, acc.items as readonly Node[], step.edgeType, step.direction),
            isNodeContext: true, // Traversal returns nodes
          };
        }
        case 'sort': {
          return {
            ...acc,
            items: applySort(acc.items, step.sort),
          };
        }
        case 'limit': {
          return {
            ...acc,
            items: acc.items.slice(0, step.limit),
          };
        }
        default: {
          return acc;
        }
      }
    },
    initial,
  );

  if (result.error) {
    return err(result.error);
  }

  return result.isNodeContext
    ? ok({ nodes: result.items as readonly Node[], edges: [] })
    : ok({ nodes: [], edges: result.items as readonly Edge[] });
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
    const getPropValue = (): unknown => {
      if ('source' in item && predicate.property === 'source') return item.source;
      if ('target' in item && predicate.property === 'target') return item.target;

      const prop = item.properties.get(predicate.property);
      if (prop) return unwrapValue(prop);
      return undefined;
    };

    const pVal = getPropValue();
    if (pVal === undefined) {
      if (predicate.operator === 'exists') return false;
      return false;
    }

    const value = predicate.value;

    switch (predicate.operator) {
      case 'eq': {
        return pVal === value;
      }
      case 'neq': {
        return pVal !== value;
      }
      case 'gt': {
        return compare(pVal, value) > 0;
      }
      case 'gte': {
        return compare(pVal, value) >= 0;
      }
      case 'lt': {
        return compare(pVal, value) < 0;
      }
      case 'lte': {
        return compare(pVal, value) <= 0;
      }
      case 'contains': {
        if (Array.isArray(pVal)) {
          return pVal.includes(value);
        } else if (typeof pVal === 'string') {
          return pVal.includes(value as string);
        }
        return false;
      }
      case 'exists': {
        return pVal !== undefined && pVal !== null;
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

      const sourceMatches = nodeIds.has(edge.source);
      const targetMatches = nodeIds.has(edge.target);

      switch (direction) {
        case 'out': {
          return sourceMatches && graph.nodes.has(edge.target)
            ? [graph.nodes.get(edge.target)!]
            : [];
        }
        case 'in': {
          return targetMatches && graph.nodes.has(edge.source)
            ? [graph.nodes.get(edge.source)!]
            : [];
        }
        case 'both': {
          return [
            ...(sourceMatches && graph.nodes.has(edge.target)
              ? [graph.nodes.get(edge.target)!]
              : []),
            ...(targetMatches && graph.nodes.has(edge.source)
              ? [graph.nodes.get(edge.source)!]
              : []),
          ];
        }
        default: {
          return [];
        }
      }
    }),
  );
}

function applySort(items: readonly GraphItem[], sort: Sort): readonly GraphItem[] {
  return [...items].sort((a, b) => {
    const valA = unwrapValue(a.properties.get(sort.property));
    const valB = unwrapValue(b.properties.get(sort.property));

    if (valA === valB) return 0;
    if (valA === undefined) return 1; // undefined last
    if (valB === undefined) return -1;

    const comparison = compare(valA, valB);
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

function unwrapValue(prop: PropertyValue | undefined): unknown {
  if (!prop) return undefined;
  if (prop.kind === 'list') {
    return prop.items.map(unwrapScalar);
  }
  return unwrapScalar(prop);
}

function unwrapScalar(scalar: import('@canopy/types').ScalarValue): unknown {
  if ('value' in scalar) {
    return scalar.value;
  }
  if (scalar.kind === 'reference') {
    return scalar.target;
  }
  if (scalar.kind === 'external-reference') {
    return `${scalar.graph}://${scalar.target}`;
  }
  return undefined;
}
