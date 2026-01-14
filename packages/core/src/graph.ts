import type { Graph, GraphId, Result } from '@canopy/types';
import { createInstant } from '@canopy/types';
import { bootstrap } from './bootstrap';

// Re-export types for convenience

/**
 * Creates a new empty graph.
 */
export function createGraph(id: GraphId, name: string): Result<Graph, Error> {
  // We construct the graph object here. It is immutable after construction.
  // The type Graph is Readonly<{...}>.
  const graph: Graph = {
    id,
    name,
    metadata: {
      created: createInstant(),
      modified: createInstant(),
    },
    nodes: new Map(),
    edges: new Map(),
  };
  return bootstrap(graph);
}

export { type Node, type Graph, type Edge } from '@canopy/types';
