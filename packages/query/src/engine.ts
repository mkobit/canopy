import { Graph, Node, Edge, QueryResult, PropertyValue } from '@canopy/types';
import { Query, Filter, Sort, QueryStep } from './model';
import { reduce, filter, unique } from 'remeda';

type GraphItem = Node | Edge;

export class QueryEngine {
  constructor(private graph: Graph) {}

  execute(query: Query): QueryResult {
    // We need to keep track of isNodeContext which changes based on steps.
    // reduce is suitable here.
    const initial: { items: GraphItem[], isNodeContext: boolean } = { items: [], isNodeContext: false };

    const result = reduce(
      query.steps,
      (acc, step: QueryStep) => {
        switch (step.kind) {
          case 'node-scan':
            return {
              items: this.scanNodes(step.type),
              isNodeContext: true
            };
          case 'edge-scan':
            return {
              items: this.scanEdges(step.type),
              isNodeContext: false
            };
          case 'filter':
            return {
              ...acc,
              items: this.applyFilter(acc.items, step.predicate)
            };
          case 'traversal':
            if (!acc.isNodeContext) {
              throw new Error('Traversal can only be performed on nodes.');
            }
            return {
              items: this.traverse(acc.items as Node[], step.edgeType, step.direction),
              isNodeContext: true // Traversal returns nodes
            };
          case 'sort':
            return {
              ...acc,
              items: this.applySort(acc.items, step.sort)
            };
          case 'limit':
            return {
              ...acc,
              items: acc.items.slice(0, step.limit)
            };
          default:
            return acc;
        }
      },
      initial
    );

    if (result.isNodeContext) {
      return { nodes: result.items as Node[], edges: [] };
    } else {
      return { nodes: [], edges: result.items as Edge[] };
    }
  }

  private scanNodes(type?: string): Node[] {
    const nodes = Array.from(this.graph.nodes.values());
    if (!type) return nodes;
    return filter(nodes, node => node.type === type);
  }

  private scanEdges(type?: string): Edge[] {
    const edges = Array.from(this.graph.edges.values());
    if (!type) return edges;
    return filter(edges, edge => edge.type === type);
  }

  private applyFilter(items: GraphItem[], predicate: Filter): GraphItem[] {
    return filter(items, item => {
      let propValue: unknown;

      // Special handling for edge source/target which are top-level properties on Edge
      if ('source' in item && predicate.property === 'source') {
        propValue = item.source;
      } else if ('target' in item && predicate.property === 'target') {
        propValue = item.target;
      } else {
        // Normal property lookup
        const prop = item.properties.get(predicate.property);
        if (!prop && predicate.operator !== 'exists') return false; // Default strictness
        if (!prop && predicate.operator === 'exists') return false; // Doesn't exist

        // Unwrap PropertyValue for comparison
        if (prop) {
           propValue = this.unwrapValue(prop);
        }
      }

      const value = predicate.value;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = propValue as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const v = value as any;

      switch (predicate.operator) {
        case 'eq': return propValue === value;
        case 'neq': return propValue !== value;
        case 'gt': return p > v;
        case 'gte': return p >= v;
        case 'lt': return p < v;
        case 'lte': return p <= v;
        case 'contains':
          if (Array.isArray(propValue)) {
            return propValue.includes(value);
          } else if (typeof propValue === 'string') {
            return propValue.includes(value as string);
          }
          return false;
        case 'exists': return propValue !== undefined && propValue !== null;
        default: return false;
      }
    });
  }

  private traverse(nodes: Node[], edgeType: string | undefined, direction: 'out' | 'in' | 'both'): Node[] {
    const nodeIds = new Set(nodes.map(n => n.id));

    // Get all edges that match the criteria
    const edges = Array.from(this.graph.edges.values());

    return unique(
      reduce(
        edges,
        (acc: Node[], edge: Edge) => {
          if (edgeType && edge.type !== edgeType) return acc;

          const sourceMatches = nodeIds.has(edge.source);
          const targetMatches = nodeIds.has(edge.target);

          if (direction === 'out' && sourceMatches) {
            const targetNode = this.graph.nodes.get(edge.target);
            if (targetNode) acc.push(targetNode);
          } else if (direction === 'in' && targetMatches) {
            const sourceNode = this.graph.nodes.get(edge.source);
            if (sourceNode) acc.push(sourceNode);
          } else if (direction === 'both') {
            if (sourceMatches) {
              const targetNode = this.graph.nodes.get(edge.target);
              if (targetNode) acc.push(targetNode);
            }
            if (targetMatches) {
              const sourceNode = this.graph.nodes.get(edge.source);
              if (sourceNode) acc.push(sourceNode);
            }
          }
          return acc;
        },
        []
      )
    );
  }

  private applySort(items: GraphItem[], sort: Sort): GraphItem[] {
    return [...items].sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valA = this.unwrapValue(a.properties.get(sort.property)) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const valB = this.unwrapValue(b.properties.get(sort.property)) as any;

      if (valA === valB) return 0;
      if (valA === undefined) return 1; // undefined last
      if (valB === undefined) return -1;

      const comparison = valA < valB ? -1 : 1;
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }

  private unwrapValue(prop: PropertyValue | undefined): unknown {
    if (!prop) return undefined;
    if (prop.kind === 'list') {
      return prop.items.map(item => this.unwrapScalar(item));
    }
    return this.unwrapScalar(prop);
  }

  private unwrapScalar(scalar: import('@canopy/types').ScalarValue): unknown {
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
}

export function executeQuery(graph: Graph, query: Query): QueryResult {
  const engine = new QueryEngine(graph);
  return engine.execute(query);
}
