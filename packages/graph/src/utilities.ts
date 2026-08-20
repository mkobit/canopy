import type { Graph } from './graph';
import type { Node } from './node';

/**
 * Iterates over graph nodes and finds the first node matching the predicate.
 * This avoids creating intermediate arrays of all nodes.
 */
export function findNode(graph: Graph, predicate: (node: Node) => boolean): Node | undefined {
  return graph.nodes.values().find(predicate);
}
