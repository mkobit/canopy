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

    it('should create a graph with bootstrap nodes', () => {
        expect(emptyGraph.id).toBe(graphId)
        expect(emptyGraph.name).toBe('Test Graph')
        // Bootstrap adds 6 nodes (NodeType, EdgeType, ChildOf, Defines, References, Prerequisite)
        expect(emptyGraph.nodes.size).toBe(7)
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
        expect(g1.nodes.size).toBe(8) // 7 bootstrap + 1 new
        expect(g1.nodes.get(nodeId1)).toBe(node1)
        expect(emptyGraph.nodes.size).toBe(7) // Original unmodified (bootstrap nodes)

        const g2 = addNode(g1, node2)
        expect(g2.nodes.size).toBe(9) // 7 bootstrap + 2 new
        expect(g2.nodes.get(nodeId2)).toBe(node2)
        expect(g1.nodes.size).toBe(8) // Previous version unmodified
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
        expect(gRemoved.nodes.size).toBe(8) // 7 bootstrap + 1 remaining node
        expect(gRemoved.nodes.has(nodeId1)).toBe(false)
        expect(gRemoved.edges.size).toBe(0) // Edge should be removed

        expect(g.nodes.size).toBe(9) // 7 bootstrap + 2 nodes
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

        // getNodesByType should find the 2 people we added.
        // It should NOT find bootstrap nodes unless they have type 'person' (which they don't).
        const people = getNodesByType(g, asTypeId('person'));
        expect(people).toHaveLength(2)
        expect(people.map(p => p.id)).toContain(nodeId1)
        expect(people.map(p => p.id)).toContain(nodeId2)

        expect(getEdgesFrom(g, nodeId1)).toHaveLength(1)
        expect(getEdgesTo(g, nodeId2)).toHaveLength(1)
        expect(getEdgesTo(g, nodeId1)).toHaveLength(0)
    })

    it('should update edges immutably', () => {
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

        const gUpdated = updateEdge(g, edgeId, (e) => ({
            ...e,
            properties: new Map([['since', { kind: 'number', value: 2023 }]])
        }))

        expect(gUpdated.edges.get(edgeId)?.properties.get('since')).toEqual({ kind: 'number', value: 2023 })
        expect(g.edges.get(edgeId)?.properties.size).toBe(0) // Original unmodified
    })

    it('should remove edges', () => {
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

        const gRemoved = removeEdge(g, edgeId)
        expect(gRemoved.edges.size).toBe(0)
        expect(g.edges.size).toBe(1) // Original unmodified
    })
})
