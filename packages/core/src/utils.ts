
import type { Graph, Node } from '@canopy/types'

/**
 * Iterates over graph nodes and finds the first node matching the predicate.
 * This avoids creating intermediate arrays of all nodes.
 */
export function findNode(graph: Graph, predicate: (node: Node) => boolean): Node | undefined {
    // eslint-disable-next-line functional/no-loop-statements
    for (const node of graph.nodes.values()) {
        if (predicate(node)) {
            return node
        }
    }
    return undefined
}
