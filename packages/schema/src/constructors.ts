import type { Result } from '@canopy/types';
import {
  type NodeId,
  type EdgeId,
  type TypeId,
  type GraphId,
  type Instant,
  type PlainDate,
  asNodeId,
  asEdgeId,
  asTypeId,
  asGraphId,
  asInstant,
  asPlainDate,
  createNodeId as generateNodeId,
  createEdgeId as generateEdgeId,
  createGraphId as generateGraphId,
  ok,
  err,
} from '@canopy/types';
import { Temporal } from 'temporal-polyfill';

// UUID regex (generic)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateUuid(id: string, label: string): Result<void, Error> {
  if (!UUID_REGEX.test(id)) {
    return err(new Error(`Invalid ${label}: '${id}' is not a valid UUID.`));
  }
  return ok(undefined);
}

/**
 * Creates a branded NodeId from a string, validating that it is a valid UUID.
 * If no string is provided, generates a new random NodeId.
 */
export function createNodeId(id?: string): Result<NodeId, Error> {
  if (id === undefined) {
    return ok(generateNodeId());
  }
  const validation = validateUuid(id, 'NodeId');
  if (!validation.ok) return err(validation.error);
  return ok(asNodeId(id));
}

/**
 * Creates a branded EdgeId from a string, validating that it is a valid UUID.
 * If no string is provided, generates a new random EdgeId.
 */
export function createEdgeId(id?: string): Result<EdgeId, Error> {
  if (id === undefined) {
    return ok(generateEdgeId());
  }
  const validation = validateUuid(id, 'EdgeId');
  if (!validation.ok) return err(validation.error);
  return ok(asEdgeId(id));
}

/**
 * Creates a branded GraphId from a string, validating that it is a valid UUID.
 * If no string is provided, generates a new random GraphId.
 */
export function createGraphId(id?: string): Result<GraphId, Error> {
  if (id === undefined) {
    return ok(generateGraphId());
  }
  const validation = validateUuid(id, 'GraphId');
  if (!validation.ok) return err(validation.error);
  return ok(asGraphId(id));
}

/**
 * Creates a branded TypeId from a string.
 * TypeIds are user-defined strings, but we validate they are non-empty and alphanumeric (with dashes/underscores).
 */
export function createTypeId(id: string): Result<TypeId, Error> {
  if (!id || typeof id !== 'string') {
    return err(new Error(`Invalid TypeId: must be a non-empty string.`));
  }
  // Allow alphanumeric, dashes, underscores, dots, colons.
  if (!/^[a-zA-Z0-9_\-.:]+$/.test(id)) {
    return err(new Error(`Invalid TypeId: '${id}' contains invalid characters.`));
  }
  return ok(asTypeId(id));
}

/**
 * Creates a branded Instant from an ISO 8601 string.
 * Validates that the string is a valid date-time.
 */
export function createInstant(isoString: string): Result<Instant, Error> {
  try {
    const instant = Temporal.Instant.from(isoString);
    return ok(asInstant(instant.toString()));
  } catch {
    return err(new Error(`Invalid Instant: '${isoString}' is not a valid ISO 8601 date string.`));
  }
}

/**
 * Creates a branded PlainDate from an ISO 8601 date string (YYYY-MM-DD).
 */
export function createPlainDate(dateString: string): Result<PlainDate, Error> {
  try {
    const date = Temporal.PlainDate.from(dateString);
    return ok(asPlainDate(date.toString()));
  } catch {
    return err(new Error(`Invalid PlainDate: '${dateString}' must be in YYYY-MM-DD format.`));
  }
}
