import type { TypeId } from './identifiers'
import type { PropertyDefinition } from './properties'

/**
 * Defines a node type in the meta-circular type system.
 * NodeTypeDefinition instances are stored as nodes themselves.
 */
export interface NodeTypeDefinition {
  readonly id: TypeId
  readonly name: string
  readonly description: string | undefined
  readonly properties: readonly PropertyDefinition[]
  readonly validOutgoingEdges: readonly TypeId[]
  readonly validIncomingEdges: readonly TypeId[]
}

/**
 * Defines an edge type in the meta-circular type system.
 * EdgeTypeDefinition instances are stored as nodes themselves.
 */
export interface EdgeTypeDefinition {
  readonly id: TypeId
  readonly name: string
  readonly description: string | undefined
  readonly sourceTypes: readonly TypeId[]
  readonly targetTypes: readonly TypeId[]
  readonly properties: readonly PropertyDefinition[]
  readonly transitive: boolean
  readonly inverse: TypeId | undefined
}
