import type { Graph, Node, Edge, GraphId } from '@canopy/types'
import { createInstant } from '@canopy/types'
import { bootstrap } from './bootstrap'

// Re-export types for convenience
export type { Graph, Node, Edge }

/**
 * Creates a new empty graph.
 */
export function createGraph(id: GraphId, name: string): Graph {
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
