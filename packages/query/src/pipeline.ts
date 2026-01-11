import type { Query, Operator } from './model';

export function query(): Query {
  return { steps: [] };
}

export function nodes(type?: string) {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'node-scan', type }],
  });
}

export function edges(type?: string) {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'edge-scan', type }],
  });
}

export function where(property: string, operator: Operator, value?: unknown) {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'filter', predicate: { property, operator, value } }],
  });
}

export function orderBy(property: string, direction: 'asc' | 'desc' = 'asc') {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'sort', sort: { property, direction } }],
  });
}

export function limit(limit: number) {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'limit', limit }],
  });
}

export function traverse(edgeType?: string, direction: 'out' | 'in' | 'both' = 'out') {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'traversal', edgeType, direction }],
  });
}

export function from(nodeId: string) {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'filter', predicate: { property: 'source', operator: 'eq', value: nodeId } }],
  });
}

export function to(nodeId: string) {
  return (q: Query): Query => ({
    ...q,
    steps: [...q.steps, { kind: 'filter', predicate: { property: 'target', operator: 'eq', value: nodeId } }],
  });
}
