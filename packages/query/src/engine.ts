import { Graph, Node, Edge, QueryResult, PropertyValue } from '@canopy/types';
import { Query, Filter, Sort } from './model.js';

type GraphItem = Node | Edge;

export class QueryEngine {
  constructor(private graph: Graph) {}

  execute(query: Query): QueryResult {
    let currentItems: GraphItem[] = [];
    let isNodeContext = false;

    for (const step of query.steps) {
      switch (step.kind) {
        case 'node-scan':
          currentItems = this.scanNodes(step.type);
          isNodeContext = true;
          break;
        case 'edge-scan':
          currentItems = this.scanEdges(step.type);
          isNodeContext = false;
          break;
        case 'filter':
          currentItems = this.applyFilter(currentItems, step.predicate);
          break;
        case 'traversal':
          if (!isNodeContext) {
            throw new Error('Traversal can only be performed on nodes.');
          }
          currentItems = this.traverse(currentItems as Node[], step.edgeType, step.direction);
          isNodeContext = true; // Traversal returns nodes
          break;
        case 'sort':
          currentItems = this.applySort(currentItems, step.sort);
          break;
        case 'limit':
          currentItems = currentItems.slice(0, step.limit);
          break;
      }
    }

    if (isNodeContext) {
      return { nodes: currentItems as Node[], edges: [] };
    } else {
      return { nodes: [], edges: currentItems as Edge[] };
    }
  }

  private scanNodes(type?: string): Node[] {
    const nodes: Node[] = [];
    for (const node of this.graph.nodes.values()) {
      if (!type || node.type === type) {
        nodes.push(node);
      }
    }
    return nodes;
  }

  private scanEdges(type?: string): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.graph.edges.values()) {
      if (!type || edge.type === type) {
        edges.push(edge);
      }
    }
    return edges;
  }

  private applyFilter(items: GraphItem[], predicate: Filter): GraphItem[] {
    return items.filter(item => {
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

      switch (predicate.operator) {
        case 'eq': return propValue === value;
        case 'neq': return propValue !== value;
        case 'gt': return p > value;
        case 'gte': return p >= value;
        case 'lt': return p < value;
        case 'lte': return p <= value;
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
    const resultNodes = new Set<Node>();
    const nodeIds = new Set(nodes.map(n => n.id));

    for (const edge of this.graph.edges.values()) {
      if (edgeType && edge.type !== edgeType) continue;

      // Note: edge.source and edge.target are NodeIds (branded strings)
      // nodeIds contains NodeIds.
      // Comparison should work directly.

      const sourceMatches = nodeIds.has(edge.source);
      const targetMatches = nodeIds.has(edge.target);

      if (direction === 'out' && sourceMatches) {
        const targetNode = this.graph.nodes.get(edge.target);
        if (targetNode) resultNodes.add(targetNode);
      } else if (direction === 'in' && targetMatches) {
        const sourceNode = this.graph.nodes.get(edge.source);
        if (sourceNode) resultNodes.add(sourceNode);
      } else if (direction === 'both') {
        if (sourceMatches) {
           const targetNode = this.graph.nodes.get(edge.target);
           if (targetNode) resultNodes.add(targetNode);
        }
        if (targetMatches) {
           const sourceNode = this.graph.nodes.get(edge.source);
           if (sourceNode) resultNodes.add(sourceNode);
        }
      }
    }
    return Array.from(resultNodes);
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
      return prop.items.map(item => item.value); // Simplified unwrapping
    }
    if ('value' in prop) {
        return prop.value;
    }
    if (prop.kind === 'reference') return prop.target as string;
    if (prop.kind === 'external-reference') return `${prop.graph}://${prop.target}`; // Simplified representation

    return undefined;
  }
}

export function executeQuery(graph: Graph, query: Query): QueryResult {
  const engine = new QueryEngine(graph);
  return engine.execute(query);
}
