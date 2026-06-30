import * as Y from 'yjs';
import type { Node, NodeId, Result } from '@canopy/graph';
import {
  createNodeId,
  createInstant,
  asNodeId,
  ok,
  err,
  asDeviceId,
  fromThrowable,
} from '@canopy/graph';
import { NodeSchema } from '@canopy/graph';
import { map } from 'remeda';
import { nodeToStorable, storableToNode } from '../converters';

export function addNode(
  nodes: Y.Map<unknown>,
  texts: Y.Map<unknown>,
  data: Omit<Node, 'id' | 'metadata'> &
    Readonly<{
      id?: string;
    }>,
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
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
  };

  // Validate schema on the domain object
  const validation = NodeSchema.safeParse(node);
  if (!validation.success) {
    return err(new Error(`Node validation failed: ${validation.error}`));
  }

  // Handle Y.Text content initialization
  const content = data.properties.get('content');
  if (typeof content === 'string') {
    const ytext = new Y.Text();
    ytext.insert(0, content);
    texts.set(id, ytext);
  }

  nodes.set(node.id, nodeToStorable(node));
  return ok(node);
}

export function getNode(
  nodes: Y.Map<unknown>,
  texts: Y.Map<unknown>,
  id: string,
): Result<Node, Error> {
  const n = nodes.get(id);
  if (!n) {
    return err(new Error(`Node ${id} not found`));
  }
  return fromThrowable(() => storableToNode(n, texts));
}

export function getAllNodes(
  nodes: Y.Map<unknown>,
  texts: Y.Map<unknown>,
): Result<IterableIterator<Node>, Error> {
  return fromThrowable(() =>
    map([...nodes.values()], (n) => storableToNode(n, texts))[Symbol.iterator](),
  );
}

export function updateNode(
  nodes: Y.Map<unknown>,
  texts: Y.Map<unknown>,
  id: string,
  partial: Partial<Omit<Node, 'id' | 'metadata'>>,
): Result<Node, Error> {
  const existingResult = getNode(nodes, texts, id);
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
      modifiedBy: asDeviceId('00000000-0000-0000-0000-000000000000'),
    },
  };

  // Validate schema
  const validation = NodeSchema.safeParse(updated);
  if (!validation.success) {
    return err(new Error(`Node validation failed: ${validation.error}`));
  }

  // Handle Y.Text content updates
  if (partial.properties) {
    const content = partial.properties.get('content');
    if (typeof content === 'string') {
      const ytext = texts.get(id);
      if (ytext && ytext instanceof Y.Text) {
        if (ytext.toString() !== content) {
          ytext.delete(0, ytext.length);
          ytext.insert(0, content);
        }
      } else {
        const newYText = new Y.Text();
        newYText.insert(0, content);
        texts.set(id, newYText);
      }
    }
  }

  nodes.set(id, nodeToStorable(updated));
  return ok(updated);
}

export function deleteNode(
  nodes: Y.Map<unknown>,
  texts: Y.Map<unknown>,
  id: string,
): Result<void, Error> {
  if (!nodes.has(id)) {
    return err(new Error(`Node ${id} not found`));
  }
  nodes.delete(id);
  texts.delete(id);
  return ok(undefined);
}
