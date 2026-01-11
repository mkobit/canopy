import * as Y from 'yjs';
import {
  Node,
  NodeId,
  createNodeId,
  createInstant,
  asNodeId,
  Result,
  ok,
  err
} from '@canopy/types';
import { NodeSchema } from '@canopy/schema';
import { map } from 'remeda';
import { nodeToStorable, storableToNode } from '../converters';

export function addNode(
  nodes: Y.Map<unknown>,
  data: Omit<Node, 'id' | 'metadata'> & Readonly<{
    id?: string;
  }>
): Result<Node, Error> {
  const now = createInstant();

  // Validate or generate ID safely
  const id: NodeId = data.id ? asNodeId(data.id) : createNodeId();

  if (nodes.has(id)) {
    return err(new Error(`Node ${id} already exists`));
  }

  const node: Node = {
    id,
    type: data.type,
    properties: data.properties,
    metadata: {
      created: now,
      modified: now,
    }
  };

  // Validate schema on the domain object
  const validation = NodeSchema.safeParse(node);
  if (!validation.success) {
      return err(new Error(`Node validation failed: ${validation.error}`));
  }

  nodes.set(node.id, nodeToStorable(node));
  return ok(node);
}

export function getNode(nodes: Y.Map<unknown>, id: string): Result<Node, Error> {
  const n = nodes.get(id);
  if (!n) {
    return err(new Error(`Node ${id} not found`));
  }
  try {
    return ok(storableToNode(n));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function getAllNodes(nodes: Y.Map<unknown>): Result<IterableIterator<Node>, Error> {
  try {
    const iterator = map(Array.from(nodes.values()), storableToNode)[Symbol.iterator]();
    return ok(iterator);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

export function updateNode(
  nodes: Y.Map<unknown>,
  id: string,
  partial: Partial<Omit<Node, 'id' | 'metadata'>>
): Result<Node, Error> {
  const existingResult = getNode(nodes, id);
  if (!existingResult.ok) {
    return existingResult;
  }
  const existing = existingResult.value;

  const now = createInstant();
  const updated: Node = {
    ...existing,
    ...partial,
    metadata: {
      ...existing.metadata,
      modified: now,
    },
  };

  // Validate schema
  const validation = NodeSchema.safeParse(updated);
  if (!validation.success) {
      return err(new Error(`Node validation failed: ${validation.error}`));
  }

  nodes.set(id, nodeToStorable(updated));
  return ok(updated);
}

export function deleteNode(nodes: Y.Map<unknown>, id: string): Result<void, Error> {
  if (!nodes.has(id)) {
    return err(new Error(`Node ${id} not found`));
  }
  nodes.delete(id);
  return ok(undefined);
}
