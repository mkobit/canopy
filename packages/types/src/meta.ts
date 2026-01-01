import type { TypeId } from './identifiers.js'
import type { PropertyDefinition } from './properties.js'

/**
 * Defines a node type in the meta-circular type system.
 * NodeTypeDefinition instances are stored as nodes themselves.
 */
export interface NodeTypeDefinition {
  readonly id: TypeId
  readonly name: string
  readonly description: string | undefined
  readonly properties: ReadonlyArray<PropertyDefinition>
  readonly validOutgoingEdges: ReadonlyArray<TypeId>
  readonly validIncomingEdges: ReadonlyArray<TypeId>
}

/**
 * Defines an edge type in the meta-circular type system.
 * EdgeTypeDefinition instances are stored as nodes themselves.
 */
export interface EdgeTypeDefinition {
  readonly id: TypeId
  readonly name: string
  readonly description: string | undefined
  readonly sourceTypes: ReadonlyArray<TypeId>
  readonly targetTypes: ReadonlyArray<TypeId>
  readonly properties: ReadonlyArray<PropertyDefinition>
  readonly transitive: boolean
  readonly inverse: TypeId | undefined
}
