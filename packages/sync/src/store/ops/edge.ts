import type * as Y from 'yjs';
import type {
  Edge,
  EdgeId,
  Result} from '@canopy/types';
import {
  createEdgeId,
  createInstant,
  asEdgeId,
  ok,
  err,
} from '@canopy/types';
import { EdgeSchema } from '@canopy/schema';
import { map } from 'remeda';
import { edgeToStorable, storableToEdge } from '../converters';

export function addEdge(
  edges: Y.Map<unknown>,
  nodes: Y.Map<unknown>,
  data: Omit<Edge, 'id' | 'metadata'> & Readonly<{
    id?: string;
  }>,
): Result<Edge, Error> {
  if (!nodes.has(data.source)) {
    return err(new Error(`Source node ${data.source} not found`));
  }
  if (!nodes.has(data.target)) {
    return err(new Error(`Target node ${data.target} not found`));
  }

  const now = createInstant();
  const id: EdgeId = data.id ? asEdgeId(data.id) : createEdgeId();

  if (edges.has(id)) {
      return err(new Error(`Edge ${id} already exists`));
  }

  const edge: Edge = {
    id,
    source: data.source,
    target: data.target,
    type: data.type,
    properties: data.properties,
    metadata: {
      created: now,
      modified: now,
    },
  };

  // Validate schema
  const validation = EdgeSchema.safeParse(edge);
  if (!validation.success) {
      return err(new Error(`Edge validation failed: ${validation.error}`));
  }

  edges.set(edge.id, edgeToStorable(edge));
  return ok(edge);
}

export function getEdge(edges: Y.Map<unknown>, id: string): Result<Edge, Error> {
  const e = edges.get(id);
  if (!e) {
    return err(new Error(`Edge ${id} not found`));
  }
  try {
    return ok(storableToEdge(e));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function getAllEdges(edges: Y.Map<unknown>): Result<IterableIterator<Edge>, Error> {
  try {
    const iterator = map(Array.from(edges.values()), storableToEdge)[Symbol.iterator]();
    return ok(iterator);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function updateEdge(
  edges: Y.Map<unknown>,
  nodes: Y.Map<unknown>,
  id: string,
  partial: Partial<Omit<Edge, 'id' | 'metadata'>>,
): Result<Edge, Error> {
    const existingResult = getEdge(edges, id);
    if (!existingResult.ok) {
        return existingResult;
    }
    const existing = existingResult.value;

    const now = createInstant();
    const updated: Edge = {
        ...existing,
        ...partial,
        metadata: {
            ...existing.metadata,
            modified: now,
        },
    };

     // Check if source and target exist if they are being updated
      if (partial.source && !nodes.has(partial.source)) {
          return err(new Error(`Source node ${partial.source} not found`));
      }
      if (partial.target && !nodes.has(partial.target)) {
          return err(new Error(`Target node ${partial.target} not found`));
      }

    // Validate schema
    const validation = EdgeSchema.safeParse(updated);
    if (!validation.success) {
        return err(new Error(`Edge validation failed: ${validation.error}`));
    }

    edges.set(id, edgeToStorable(updated));
    return ok(updated);
}

export function deleteEdge(edges: Y.Map<unknown>, id: string): Result<void, Error> {
    if (!edges.has(id)) {
        return err(new Error(`Edge ${id} not found`));
    }
    edges.delete(id);
    return ok(undefined);
}
