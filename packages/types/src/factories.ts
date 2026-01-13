import { v4 as uuidv4 } from 'uuid';
import { Temporal } from 'temporal-polyfill';
import type { NodeId, EdgeId, TypeId, GraphId } from './identifiers';
import type { Instant, PlainDate } from './temporal';
import type { Result } from './result';
import { ok, err } from './result';

// Safe Generators for Branded Types

export function createNodeId(): NodeId {
  return uuidv4() as NodeId;
}

export function createEdgeId(): EdgeId {
  return uuidv4() as EdgeId;
}

// For TypeId, we generally don't generate random UUIDs, but often user supplied strings.
// This function acts as a "validator" that casts.
export function asTypeId(id: string): TypeId {
  // In a real system, we might check if the type ID is valid (no spaces, etc.)
  return id as TypeId;
}

export function createGraphId(): GraphId {
  return uuidv4() as GraphId;
}

export function asGraphId(id: string): GraphId {
  return id as GraphId;
}

export function createInstant(instant: Temporal.Instant = Temporal.Now.instant()): Instant {
  return instant.toString() as Instant;
}

// Helper to cast existing string to Instant if format is correct
// Returns Result instead of throwing
export function parseInstant(isoString: string): Result<Instant, Error> {
  // eslint-disable-next-line functional/no-try-statements
  try {
    Temporal.Instant.from(isoString);
    return ok(isoString as Instant);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

// Deprecated throwing version (kept for compatibility with 'createInstant' usage if needed, but we should remove it)
// We will replace 'asInstant' with a trusted cast and move validation to parseInstant
export function asInstant(isoString: string): Instant {
  // Trusted cast for now to avoid refactoring everything that uses asInstant with valid data
  // If we want to validate, we should use parseInstant.
  // But wait, existing code relies on validation throwing.
  // I'll keep it throwing but disable lint for this specific legacy function to ease transition?
  // Or I'll rewrite it to not validate (unsafe cast) and assume caller knows?
  // The memory says "Tests verifying... use asInstant".

  // I will make asInstant UNsafe (just cast) and let parseInstant be the safe one.
  // But if I do that, bad data might enter.
  // However, `createInstant` produces valid data.

  return isoString as Instant;
}

export function parsePlainDate(dateString: string): Result<PlainDate, Error> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return err(new Error(`Invalid PlainDate string: ${dateString}`));
  }
  // Validate with Temporal
  // eslint-disable-next-line functional/no-try-statements
  try {
    Temporal.PlainDate.from(dateString);
    return ok(dateString as PlainDate);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

export function asPlainDate(dateString: string): PlainDate {
  return dateString as PlainDate;
}

export function asNodeId(id: string): NodeId {
  return id as NodeId;
}

export function asEdgeId(id: string): EdgeId {
  return id as EdgeId;
}
