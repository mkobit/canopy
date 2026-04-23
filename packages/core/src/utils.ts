import { v7 as uuidv7 } from 'uuid';
import { createInstant } from '@canopy/types';
import type { Graph, Node, GraphEvent } from '@canopy/types';

/**
 * Generates a stable UUIDv7 string for workflow execution contexts.
 * This ID is used as the batchId for all events produced within a single workflow execution to ensure atomicity.
 */
export function generateExecutionId(): string {
  return uuidv7();
}

/**
 * Iterates over graph nodes and finds the first node matching the predicate.
 * This avoids creating intermediate arrays of all nodes.
 */
export function findNode(graph: Graph, predicate: (node: Node) => boolean): Node | undefined {
  // eslint-disable-next-line functional/no-loop-statements
  for (const node of graph.nodes.values()) {
    if (predicate(node)) {
      return node;
    }
  }
  return undefined;
}

/**
 * Takes a list of events (missing batchId and timestamp) and returns a completed set
 * where all events share the same batchId and have a consistent timestamp.
 */
export function createBatch(events: readonly Partial<GraphEvent>[]): readonly GraphEvent[] {
  const batchId = uuidv7();
  const timestamp = createInstant();

  return events.map((event) => {
    return {
      ...event,
      batchId,
      timestamp,
    } as GraphEvent;
  });
}
