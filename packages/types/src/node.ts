import type { NodeId, TypeId } from './identifiers'
import type { TemporalMetadata } from './temporal'
import type { PropertyMap } from './properties'

/**
 * A node in the graph.
 * Nodes are the primary entities—everything is a node.
 * Generic parameter T allows narrowing to specific node types.
 */
export type Node<T extends TypeId = TypeId> = Readonly<{
  id: NodeId
  type: T
  properties: PropertyMap
  metadata: TemporalMetadata
}>
