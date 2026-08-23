import type { Result } from './result';
import type { NodeId, TypeId } from './identifiers';
import type { Instant, PlainDate } from './temporal';
import {
  asNodeId,
  asTypeId,
  asInstant,
  asPlainDate,
  createNodeId as generateNodeId,
} from './factories';
import { ok, err as error, fromThrowable } from './result';

// UUID regex (generic)
const UUID_REGEX = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

function validateUuid(id: string, label: string): Result<void, Error> {
  if (!UUID_REGEX.test(id)) {
    return error(new Error(`Invalid ${label}: '${id}' is not a valid UUID.`));
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
  if (!validation.ok) return error(validation.error);
  return ok(asNodeId(id));
}

/**
 * Creates a branded TypeId from a string.
 * TypeIds are user-defined strings, but we validate they are non-empty and alphanumeric (with dashes/underscores).
 */
export function createTypeId(id: string): Result<TypeId, Error> {
  if (!id || typeof id !== 'string') {
    return error(new Error(`Invalid TypeId: must be a non-empty string.`));
  }
  // Allow alphanumeric, dashes, underscores, dots, colons.
  if (!/^[\w.:-]+$/.test(id)) {
    return error(new Error(`Invalid TypeId: '${id}' contains invalid characters.`));
  }
  return ok(asTypeId(id));
}

/**
 * Creates a branded Instant from an ISO 8601 string.
 * Validates that the string is a valid date-time.
 */
export function createInstant(isoString: string): Result<Instant, Error> {
  return fromThrowable(
    () => {
      const instant = Temporal.Instant.from(isoString);
      return asInstant(instant.toString());
    },
    () => new Error(`Invalid Instant: '${isoString}' is not a valid ISO 8601 date string.`),
  );
}

/**
 * Creates a branded PlainDate from an ISO 8601 date string (YYYY-MM-DD).
 */
export function createPlainDate(dateString: string): Result<PlainDate, Error> {
  return fromThrowable(
    () => {
      const date = Temporal.PlainDate.from(dateString);
      return asPlainDate(date.toString());
    },
    () => new Error(`Invalid PlainDate: '${dateString}' must be in YYYY-MM-DD format.`),
  );
}
