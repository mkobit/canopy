import type { Result } from '@canopy/types';
import {
  type NodeId,
  type EdgeId,
  type TypeId,
  type GraphId,
  type Instant,
  asNodeId,
  asEdgeId,
  asTypeId,
  asGraphId,
  asInstant,
  createNodeId as generateNodeId,
  createEdgeId as generateEdgeId,
  createGraphId as generateGraphId,
  ok,
  err,
} from '@canopy/types';
import { Temporal } from 'temporal-polyfill';

// UUID regex (generic)
const UUID_REGEX = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

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
  if (!/^[\w.:-]+$/.test(id)) {
    return err(new Error(`Invalid TypeId: '${id}' contains invalid characters.`));
  }
  return ok(asTypeId(id));
}

/**
 * Creates a branded Instant from an ISO 8601 string or number.
 */
export function createInstant(value: string | number): Result<Instant, Error> {
  if (typeof value === 'number') {
    return ok(asInstant(value));
  }
  // eslint-disable-next-line functional/no-try-statements
  try {
    const instant = Temporal.Instant.from(value);
    return ok(asInstant(instant.epochMilliseconds));
  } catch {
    return err(new Error(`Invalid Instant: '${value}' is not a valid ISO 8601 date string.`));
  }
}
