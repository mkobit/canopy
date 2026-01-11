import type { Graph, Node } from '@canopy/types'
import { SYSTEM_IDS } from './system'
import { asNodeId } from '@canopy/types'
import { filter } from 'remeda'
import { findNode } from './utils'

/**
 * Returns all nodes that define node types.
 */
export function getNodeTypes(graph: Readonly<Graph>): readonly Node[] {
  return filter(Array.from(graph.nodes.values()), node => node.type === SYSTEM_IDS.NODE_TYPE)
}

/**
 * Returns all nodes that define edge types.
 */
export function getEdgeTypes(graph: Readonly<Graph>): readonly Node[] {
  return filter(Array.from(graph.nodes.values()), node => node.type === SYSTEM_IDS.EDGE_TYPE)
}

/**
 * Returns a specific node type definition node by its name,
 * or by its ID if the name is not found (or if name is treated as ID).
 *
 * Note: Type definitions are Nodes.
 * If you have a TypeId "foo", the corresponding definition node should have ID "foo".
 */
export function getNodeType(graph: Readonly<Graph>, typeNameOrId: string): Node | undefined {
    // First try to find by ID (asuming the type name is the ID)
    const nodeId = asNodeId(typeNameOrId)
    const node = graph.nodes.get(nodeId)
    if (node && node.type === SYSTEM_IDS.NODE_TYPE) {
        return node
    }

    // Fallback: search by name property
    // This assumes names are unique, which isn't guaranteed but useful for loose lookup
    return findNode(graph, n => {
        if (n.type !== SYSTEM_IDS.NODE_TYPE) return false
        const nameProp = n.properties.get('name')
        return nameProp?.kind === 'text' && nameProp.value === typeNameOrId
    })
}
