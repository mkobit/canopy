import type { GraphId, NodeId, EdgeId } from './identifiers'
import type { TemporalMetadata } from './temporal'
import type { Node } from './node'
import type { Edge } from './edge'

/**
 * A graph is the aggregate root—the bounded context for a collection of nodes and edges.
 * Analogous to a vault or database.
 */
export interface Graph {
  readonly id: GraphId
  readonly name: string
  readonly metadata: TemporalMetadata
  readonly nodes: ReadonlyMap<NodeId, Node>
  readonly edges: ReadonlyMap<EdgeId, Edge>
}

/**
 * Result of a graph query or traversal.
 */
export interface QueryResult {
  readonly nodes: readonly Node[]
  readonly edges: readonly Edge[]
}
