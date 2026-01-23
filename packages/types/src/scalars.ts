import type { NodeId } from './identifiers';
import type { Instant } from './temporal';

/**
 * Scalar property values.
 * These are the atomic value types that can be stored.
 */
export type ScalarValue = string | number | boolean | Instant | NodeId | null;
