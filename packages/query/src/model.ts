export type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';

export interface Filter {
  readonly property: string;
  readonly operator: Operator;
  readonly value?: unknown; // Value to compare against
}

export interface Sort {
  readonly property: string;
  readonly direction: 'asc' | 'desc';
}

export interface Traversal {
  readonly edgeType?: string;
  readonly direction: 'out' | 'in' | 'both';
  readonly targetFilter?: NodeQuery; // Recursive filter on the target node
}

// A step in the query pipeline
export type QueryStep =
  | { readonly kind: 'node-scan'; readonly type?: string | undefined } // Start with nodes
  | { readonly kind: 'edge-scan'; readonly type?: string | undefined } // Start with edges
  | { readonly kind: 'filter'; readonly predicate: Filter } // Filter current set
  | { readonly kind: 'traversal'; readonly edgeType?: string | undefined; readonly direction: 'out' | 'in' | 'both' } // Map nodes to connected nodes
  | { readonly kind: 'sort'; readonly sort: Sort }
  | { readonly kind: 'limit'; readonly limit: number };

export interface Query {
  readonly steps: readonly QueryStep[];
}

// Specific query types for type safety in builder if needed,
// but the pipeline is generic.

// For "NodeQuery" and "EdgeQuery" requested in the prompt,
// we can think of them as Queries that result in Nodes or Edges.
export interface NodeQuery {
  readonly steps: readonly QueryStep[];
}

export interface EdgeQuery {
  readonly steps: readonly QueryStep[];
}
