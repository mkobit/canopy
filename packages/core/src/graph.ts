import type { Graph, Node, Edge, GraphId, Result } from '@canopy/types'
import { createInstant, ok } from '@canopy/types'
import { bootstrap } from './bootstrap'

// Re-export types for convenience
export type { Graph, Node, Edge }

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
  }
  return bootstrap(graph)
}
