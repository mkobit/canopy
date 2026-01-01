import { describe, it, expect } from 'vitest'
import {
    createGraph,
    addNode,
    updateNode,
    removeNode,
    addEdge,
    updateEdge,
    removeEdge,
    getNode,
    getEdge,
    getNodesByType,
    getEdgesFrom,
    getEdgesTo
} from '../index'
import {
    createNodeId,
    createEdgeId,
    asTypeId,
    createGraphId,
    createInstant
} from '@canopy/types'
import type { Node, Edge } from '@canopy/types'

describe('Core Graph Engine', () => {
    const graphId = createGraphId()
    const emptyGraph = createGraph(graphId, 'Test Graph')

    it('should create an empty graph', () => {
        expect(emptyGraph.id).toBe(graphId)
        expect(emptyGraph.name).toBe('Test Graph')
        expect(emptyGraph.nodes.size).toBe(0)
        expect(emptyGraph.edges.size).toBe(0)
    })

    const nodeId1 = createNodeId()
    const node1: Node = {
        id: nodeId1,
        type: asTypeId('person'),
        properties: new Map(),
        metadata: { created: createInstant(), modified: createInstant() }
    }

    const nodeId2 = createNodeId()
    const node2: Node = {
        id: nodeId2,
        type: asTypeId('person'),
        properties: new Map(),
        metadata: { created: createInstant(), modified: createInstant() }
    }

    it('should add nodes immutably', () => {
        const g1 = addNode(emptyGraph, node1)
        expect(g1.nodes.size).toBe(1)
        expect(g1.nodes.get(nodeId1)).toBe(node1)
        expect(emptyGraph.nodes.size).toBe(0) // Original unmodified

        const g2 = addNode(g1, node2)
        expect(g2.nodes.size).toBe(2)
        expect(g2.nodes.get(nodeId2)).toBe(node2)
        expect(g1.nodes.size).toBe(1) // Previous version unmodified
    })

    it('should update nodes immutably', () => {
        const g1 = addNode(emptyGraph, node1)
        const g2 = updateNode(g1, nodeId1, (n) => ({
            ...n,
            properties: new Map([['name', { kind: 'text', value: 'Alice' }]])
        }))

        expect(g2.nodes.get(nodeId1)?.properties.get('name')).toEqual({ kind: 'text', value: 'Alice' })
        expect(g1.nodes.get(nodeId1)?.properties.size).toBe(0) // Original unmodified

        // Metadata modified should be updated
        expect(g2.nodes.get(nodeId1)?.metadata.modified).not.toBe(g1.nodes.get(nodeId1)?.metadata.modified)
    })

    it('should remove nodes and connected edges', () => {
        let g = addNode(emptyGraph, node1)
        g = addNode(g, node2)

        const edgeId = createEdgeId()
        const edge: Edge = {
            id: edgeId,
            source: nodeId1,
            target: nodeId2,
            type: asTypeId('knows'),
            properties: new Map(),
            metadata: { created: createInstant(), modified: createInstant() }
        }

        g = addEdge(g, edge)
        expect(g.edges.size).toBe(1)

        const gRemoved = removeNode(g, nodeId1)
        expect(gRemoved.nodes.size).toBe(1)
        expect(gRemoved.nodes.has(nodeId1)).toBe(false)
        expect(gRemoved.edges.size).toBe(0) // Edge should be removed

        expect(g.nodes.size).toBe(2) // Original unmodified
        expect(g.edges.size).toBe(1)
    })

    it('should query nodes and edges', () => {
        let g = addNode(emptyGraph, node1)
        g = addNode(g, node2)

        const edgeId = createEdgeId()
        const edge: Edge = {
            id: edgeId,
            source: nodeId1,
            target: nodeId2,
            type: asTypeId('knows'),
            properties: new Map(),
            metadata: { created: createInstant(), modified: createInstant() }
        }
        g = addEdge(g, edge)

        expect(getNode(g, nodeId1)).toBe(node1)
        expect(getEdge(g, edgeId)).toBe(edge)
        expect(getNodesByType(g, asTypeId('person'))).toHaveLength(2)
        expect(getEdgesFrom(g, nodeId1)).toHaveLength(1)
        expect(getEdgesTo(g, nodeId2)).toHaveLength(1)
        expect(getEdgesTo(g, nodeId1)).toHaveLength(0)
    })
})
