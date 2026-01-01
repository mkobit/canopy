import type { NodeId, TypeId } from './identifiers.js'
import type { TemporalMetadata } from './temporal.js'
import type { PropertyMap } from './properties.js'

/**
 * A node in the graph.
 * Nodes are the primary entities—everything is a node.
 * Generic parameter T allows narrowing to specific node types.
 */
export interface Node<T extends TypeId = TypeId> {
  readonly id: NodeId
  readonly type: T
  readonly properties: PropertyMap
  readonly metadata: TemporalMetadata
}
