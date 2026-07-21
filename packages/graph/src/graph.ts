import type { GraphId, NodeId, EdgeId } from './identifiers';
import type { TemporalMetadata } from './temporal';
import type { Node } from './node';
import type { Edge } from './edge';
import type { GraphIndexes } from './indexes';

/**
 * A graph is the aggregate root—the bounded context for a collection of nodes and edges.
 * Analogous to a vault or database.
 */
export type Graph = Readonly<{
  id: GraphId;
  name: string;
  metadata: TemporalMetadata;
  nodes: ReadonlyMap<NodeId, Node>;
  edges: ReadonlyMap<EdgeId, Edge>;
  _indexes?: GraphIndexes | undefined;
}>;

/**
 * Result of a graph query or traversal.
 */
export type QueryResult = Readonly<{
  nodes: readonly Node[];
  edges: readonly Edge[];
  rows?: readonly Readonly<Record<string, unknown>>[];
}>;
