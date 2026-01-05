import type { EdgeId, NodeId, TypeId } from './identifiers'
import type { TemporalMetadata } from './temporal'
import type { PropertyMap } from './properties'

/**
 * An edge connecting two nodes within the same graph.
 * Edges are first-class citizens with their own typed properties.
 *
 * Edges are always directional (source → target).
 * Bidirectional traversal is a query concern, not a data concern.
 */
export interface Edge<T extends TypeId = TypeId> {
  readonly id: EdgeId
  readonly type: T
  readonly source: NodeId
  readonly target: NodeId
  readonly properties: PropertyMap
  readonly metadata: TemporalMetadata
}
