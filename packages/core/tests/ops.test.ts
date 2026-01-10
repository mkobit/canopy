import { describe, it, expect } from 'vitest'
import { createGraph } from '../src/graph'
import { addNode, updateNode } from '../src/ops'
import { SYSTEM_IDS } from '../src/system'
import { createNodeId, asNodeId, asTypeId, createInstant, PropertyDefinition, PropertyValue, unwrap, isErr, isOk } from '@canopy/types'

// Test helpers
function createNode(props: Record<string, unknown>) {
  return {
    id: createNodeId(),
    type: asTypeId('test'),
    properties: new Map<string, PropertyValue>(),
    metadata: { created: createInstant(), modified: createInstant() },
    ...props,
    properties: (props.properties && !(props.properties instanceof Map))
      ? new Map(Object.entries(props.properties as Record<string, PropertyValue>))
      : (props.properties || new Map())
  }
}

describe('ops with validation', () => {
    function createGraphWithTypes() {
        let g = createGraph()

        const personProps: readonly PropertyDefinition[] = [
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
        g = unwrap(addNode(g, personTypeNode))
        return g
    }

    it('addNode returns Error if validation fails and validation is enabled', () => {
        const g = createGraphWithTypes()
        const node = createNode({
            type: asTypeId('type-person'),
            properties: {} // missing age
        })

        const result = addNode(g, node, { validate: true })
        expect(isErr(result)).toBe(true)
        if (isErr(result)) {
            expect(result.error.message).toMatch(/Node validation failed/)
        }
    })

    it('addNode succeeds if validation fails but validation is disabled (default)', () => {
        const g = createGraphWithTypes()
        const node = createNode({
            type: asTypeId('type-person'),
            properties: {} // missing age
        })

        const result = addNode(g, node)
        expect(isOk(result)).toBe(true)
    })

    it('addNode succeeds if validation passes', () => {
        const g = createGraphWithTypes()
        const node = createNode({
            type: asTypeId('type-person'),
            properties: { age: { kind: 'number', value: 20 } }
        })

        const result = addNode(g, node, { validate: true })
        expect(isOk(result)).toBe(true)
    })

    it('updateNode returns Error if validation fails', () => {
        let g = createGraphWithTypes()
        const node = createNode({
            id: asNodeId('p1'),
            type: asTypeId('type-person'),
            properties: { age: { kind: 'number', value: 20 } }
        })
        g = unwrap(addNode(g, node))

        const result = updateNode(g, node.id, n => ({
            ...n,
            properties: new Map() // remove age
        }), { validate: true })

        expect(isErr(result)).toBe(true)
        if (isErr(result)) {
            expect(result.error.message).toMatch(/Node validation failed/)
        }
    })
})
