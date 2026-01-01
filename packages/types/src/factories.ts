import { v4 as uuidv4 } from 'uuid';
import { NodeId, EdgeId, TypeId, GraphId } from './identifiers.js';
import { Instant, PlainDate } from './temporal.js';

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

export function createInstant(date: Date = new Date()): Instant {
    return date.toISOString() as Instant;
}

// Helper to cast existing string to Instant if format is correct
export function asInstant(isoString: string): Instant {
    // Basic validation
    if (isNaN(Date.parse(isoString))) {
        throw new Error(`Invalid ISO string: ${isoString}`);
    }
    return isoString as Instant;
}

export function asPlainDate(dateString: string): PlainDate {
     if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        throw new Error(`Invalid PlainDate string: ${dateString}`);
     }
     return dateString as PlainDate;
}

export function asNodeId(id: string): NodeId {
    return id as NodeId;
}

export function asEdgeId(id: string): EdgeId {
    return id as EdgeId;
}
