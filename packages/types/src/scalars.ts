import type { NodeId, GraphId } from './identifiers'
import type { Instant, PlainDate } from './temporal'

/**
 * Scalar property values.
 * These are the atomic value types that can be stored.
 */
export type ScalarValue =
  | TextValue
  | NumberValue
  | BooleanValue
  | InstantValue
  | PlainDateValue
  | ReferenceValue
  | ExternalReferenceValue

export interface TextValue {
  readonly kind: 'text'
  readonly value: string
}

export interface NumberValue {
  readonly kind: 'number'
  readonly value: number
}

export interface BooleanValue {
  readonly kind: 'boolean'
  readonly value: boolean
}

export interface InstantValue {
  readonly kind: 'instant'
  readonly value: Instant
}

export interface PlainDateValue {
  readonly kind: 'plain-date'
  readonly value: PlainDate
}

/**
 * Reference to a node within the same graph.
 */
export interface ReferenceValue {
  readonly kind: 'reference'
  readonly target: NodeId
}

/**
 * Reference to a node in a different graph.
 * Resolved at runtime like a URL, not a direct pointer.
 */
export interface ExternalReferenceValue {
  readonly kind: 'external-reference'
  readonly graph: GraphId
  readonly target: NodeId
}
