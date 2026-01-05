import { describe, it, expect } from 'vitest'
import { createGraph } from '../src/graph.js'
import { addNode, addEdge, updateNode, updateEdge } from '../src/ops.js'
import { SYSTEM_IDS } from '../src/system.js'
import { createNodeId, createEdgeId, asNodeId, asTypeId, asEdgeId, createInstant, PropertyDefinition, PropertyValue } from '@canopy/types'

// Test helpers
function createNode(props: any) {
  return {
    id: createNodeId(),
    type: asTypeId('test'),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...props,
    properties: props.properties && !(props.properties instanceof Map)
      ? new Map(Object.entries(props.properties))
      : (props.properties || new Map())
  }
}

function createEdge(props: any) {
  return {
    id: createEdgeId(),
    type: asTypeId('test'),
    source: createNodeId(),
    target: createNodeId(),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...props,
    properties: props.properties && !(props.properties instanceof Map)
      ? new Map(Object.entries(props.properties))
      : (props.properties || new Map())
  }
}

describe('ops with validation', () => {
    function createGraphWithTypes() {
        let g = createGraph()

        const personProps: PropertyDefinition[] = [
            { name: 'age', valueKind: 'number', required: true, description: 'Age' }
        ]
        const personTypeNode = createNode({
            id: asNodeId('type-person'),
            type: SYSTEM_IDS.NODE_TYPE,
            properties: {
                name: { kind: 'text', value: 'Person' },
                properties: { kind: 'text', value: JSON.stringify(personProps) }
            }
        })
        g = addNode(g, personTypeNode)
        return g
    }

    it('addNode throws if validation fails and validation is enabled', () => {
        const g = createGraphWithTypes()
        const node = createNode({
            type: asTypeId('type-person'),
            properties: {} // missing age
        })

        expect(() => addNode(g, node, { validate: true })).toThrow(/Node validation failed/)
    })

    it('addNode succeeds if validation fails but validation is disabled (default)', () => {
        const g = createGraphWithTypes()
        const node = createNode({
            type: asTypeId('type-person'),
            properties: {} // missing age
        })

        expect(() => addNode(g, node)).not.toThrow()
    })

    it('addNode succeeds if validation passes', () => {
        const g = createGraphWithTypes()
        const node = createNode({
            type: asTypeId('type-person'),
            properties: { age: { kind: 'number', value: 20 } }
        })

        expect(() => addNode(g, node, { validate: true })).not.toThrow()
    })

    it('updateNode throws if validation fails', () => {
        let g = createGraphWithTypes()
        const node = createNode({
            id: asNodeId('p1'),
            type: asTypeId('type-person'),
            properties: { age: { kind: 'number', value: 20 } }
        })
        g = addNode(g, node)

        expect(() => updateNode(g, node.id, n => ({
            ...n,
            properties: new Map() // remove age
        }), { validate: true })).toThrow(/Node validation failed/)
    })
})
