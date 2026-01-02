export type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';

export interface Filter {
  property: string;
  operator: Operator;
  value?: unknown; // Value to compare against
}

export interface Sort {
  property: string;
  direction: 'asc' | 'desc';
}

export interface Traversal {
  edgeType?: string;
  direction: 'out' | 'in' | 'both';
  targetFilter?: NodeQuery; // Recursive filter on the target node
}

// A step in the query pipeline
export type QueryStep =
  | { kind: 'node-scan'; type?: string } // Start with nodes
  | { kind: 'edge-scan'; type?: string } // Start with edges
  | { kind: 'filter'; predicate: Filter } // Filter current set
  | { kind: 'traversal'; edgeType?: string; direction: 'out' | 'in' | 'both' } // Map nodes to connected nodes
  | { kind: 'sort'; sort: Sort }
  | { kind: 'limit'; limit: number };

export interface Query {
  steps: QueryStep[];
}

// Specific query types for type safety in builder if needed,
// but the pipeline is generic.

// For "NodeQuery" and "EdgeQuery" requested in the prompt,
// we can think of them as Queries that result in Nodes or Edges.
export interface NodeQuery {
  steps: QueryStep[];
}

export interface EdgeQuery {
  steps: QueryStep[];
}
