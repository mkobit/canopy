import type { NodeId, GraphId } from './identifiers';
import type { Instant, PlainDate } from './temporal';

/**
 * Scalar property values.
 * These are the atomic value types that can be stored.
 */
export type ScalarValue =
  | string
  | number
  | boolean
  | Instant
  | PlainDate
  | NodeId
  | ExternalReferenceValue
  | null;

/**
 * Reference to a node in a different graph.
 * Resolved at runtime like a URL, not a direct pointer.
 */
export interface ExternalReferenceValue {
  readonly graph: GraphId;
  readonly target: NodeId;
}
