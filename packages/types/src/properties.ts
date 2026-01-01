import type { ScalarValue } from './scalars.js'

/**
 * A property value is either a scalar or a flat list of scalars.
 * No nesting—lists cannot contain other lists.
 */
export type PropertyValue = ScalarValue | ListValue

/**
 * A list of scalar values.
 * Lists are homogeneous—all items should be the same kind in practice,
 * though the type system allows mixed kinds for flexibility.
 */
export interface ListValue {
  readonly kind: 'list'
  readonly items: ReadonlyArray<ScalarValue>
}

/**
 * Extract the kind discriminator from any property value.
 */
export type PropertyValueKind = PropertyValue['kind']

/**
 * Schema definition for a property on a node or edge type.
 */
export interface PropertyDefinition {
  readonly name: string
  readonly valueKind: PropertyValueKind
  readonly required: boolean
  readonly description: string | undefined
}

/**
 * A collection of property values keyed by property name.
 */
export type PropertyMap = ReadonlyMap<string, PropertyValue>
