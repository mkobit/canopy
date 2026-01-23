import { v7 as uuidv7 } from 'uuid';
import { Temporal } from 'temporal-polyfill';
import type { NodeId, EdgeId, TypeId, GraphId } from './identifiers';
import type { Instant } from './temporal';
import type { Result } from './result';
import { err, ok } from './result';

// Safe Generators for Branded Types

export function createNodeId(): NodeId {
  return uuidv7() as NodeId;
}

export function createEdgeId(): EdgeId {
  return uuidv7() as EdgeId;
}

// For TypeId, we generally don't generate random UUIDs, but often user supplied strings.
// This function acts as a "validator" that casts.
export function asTypeId(id: string): TypeId {
  // In a real system, we might check if the type ID is valid (no spaces, etc.)
  return id as TypeId;
}

export function createGraphId(): GraphId {
  return uuidv7() as GraphId;
}

export function asGraphId(id: string): GraphId {
  return id as GraphId;
}

export function createInstant(
  timestamp: number = Temporal.Now.instant().epochMilliseconds,
): Instant {
  return timestamp as Instant;
}

// Helper to cast existing string or number to Instant if format is correct
export function parseInstant(value: string | number): Result<Instant, Error> {
  if (typeof value === 'number') {
    return ok(value as Instant);
  }
  // eslint-disable-next-line functional/no-try-statements
  try {
    const instant = Temporal.Instant.from(value);
    return ok(instant.epochMilliseconds as Instant);
  } catch {
    return err(new Error(`Invalid Instant string: ${value}`));
  }
}

export function asInstant(value: number): Instant {
  return value as Instant;
}

export function asNodeId(id: string): NodeId {
  return id as NodeId;
}

export function asEdgeId(id: string): EdgeId {
  return id as EdgeId;
}
