import type {
  Graph,
  Node,
  Edge,
  NodeTypeDefinition,
  EdgeTypeDefinition,
  ValidationResult,
  ValidationError,
  PropertyDefinition,
  PropertyValue,
  TypeId,
  NodeId
} from '@canopy/types'
import { asTypeId, asNodeId } from '@canopy/types'
import { getNodeType, getEdgeTypes, getNodeTypes } from './queries.js' // Assuming getEdgeType exists or we can implement it
import { SYSTEM_IDS } from './system.js'

// Helper to create a success result
const SUCCESS: ValidationResult = { valid: true, errors: [] }

// Helper to create an error result
function failure(errors: ValidationError[]): ValidationResult {
  return { valid: false, errors }
}

function failureOne(path: string[], message: string, expected?: string, actual?: string): ValidationResult {
  return failure([{ path, message, expected, actual }])
}

// Extract properties from a definition node
function extractProperties(node: Node): PropertyDefinition[] {
  const prop = node.properties.get('properties')
  if (!prop || prop.kind !== 'text') {
    return []
  }
  try {
    const raw = JSON.parse(prop.value)
    if (Array.isArray(raw)) {
       // TODO: Validate raw against PropertyDefinition schema using Zod?
       // For now, assume it's correct as per meta-circularity
       return raw as PropertyDefinition[]
    }
  } catch (e) {
    // ignore parse error, return empty
  }
  return []
}

function extractEdgeTypeDefinition(node: Node): EdgeTypeDefinition | undefined {
    // properties: JSON string
    // sourceTypes: List or JSON?
    // targetTypes: List or JSON?
    // Let's assume JSON in 'properties', and other fields are also properties.
    // However, NodeTypeDefinition interface has explicit fields.
    // We need to map Node properties to EdgeTypeDefinition.

    // Assumption: The system node has properties matching the definition fields.
    // Arrays might be stored as JSON strings if they are complex, or ListValue if simple.
    // But PropertyValue ListValue is strictly scalar.
    // So 'sourceTypes' (TypeId[]) could be ListValue of TextValue.

    const name = node.properties.get('name')
    const description = node.properties.get('description')

    // Properties def
    const properties = extractProperties(node)

    // Source/Target types
    const sourceTypesVal = node.properties.get('sourceTypes')
    const targetTypesVal = node.properties.get('targetTypes')

    let sourceTypes: TypeId[] = []
    if (sourceTypesVal?.kind === 'list') {
        sourceTypes = sourceTypesVal.items.map(i => i.kind === 'text' ? asTypeId(i.value) : asTypeId('unknown'))
    } else if (sourceTypesVal?.kind === 'text') {
        // Fallback for JSON string
        try { sourceTypes = (JSON.parse(sourceTypesVal.value) as string[]).map(asTypeId) } catch {}
    }

    let targetTypes: TypeId[] = []
    if (targetTypesVal?.kind === 'list') {
        targetTypes = targetTypesVal.items.map(i => i.kind === 'text' ? asTypeId(i.value) : asTypeId('unknown'))
    } else if (targetTypesVal?.kind === 'text') {
        try { targetTypes = (JSON.parse(targetTypesVal.value) as string[]).map(asTypeId) } catch {}
    }

    return {
        id: asTypeId(node.id), // The ID of the definition node is the TypeId it defines? Or node.type?
        // Wait, bootstrap says: id: SYSTEM_IDS.EDGE_CHILD_OF (which is a NodeId).
        // But the typeId is SYSTEM_EDGE_TYPES.CHILD_OF.
        // The definition node's ID is the type's ID (or mapped to it).
        // In bootstrap:
        // id: SYSTEM_IDS.EDGE_CHILD_OF, typeId: SYSTEM_EDGE_TYPES.CHILD_OF
        // So the NodeId of the definition IS the TypeId?
        // asNodeId('edge:type:child-of') vs asTypeId('edge:type:child-of').
        // Yes, they share the string.
        name: name?.kind === 'text' ? name.value : 'Unknown',
        description: description?.kind === 'text' ? description.value : undefined,
        properties,
        sourceTypes,
        targetTypes,
        transitive: false, // TODO: store this
        inverse: undefined // TODO: store this
    }
}

function extractNodeTypeDefinition(node: Node): NodeTypeDefinition {
    const properties = extractProperties(node)

    const name = node.properties.get('name')
    const description = node.properties.get('description')

    return {
        id: asTypeId(node.id),
        name: name?.kind === 'text' ? name.value : 'Unknown',
        description: description?.kind === 'text' ? description.value : undefined,
        properties,
        validOutgoingEdges: [], // TODO
        validIncomingEdges: [] // TODO
    }
}


function validateValue(val: PropertyValue, def: PropertyDefinition): ValidationError[] {
    const errors: ValidationError[] = []

    // Check kind
    if (val.kind !== def.valueKind) {
        // Allow automatic casting/compat in strict validation? No, prompt says:
        // "type: string" -> value must be string
        // But what if we have 'text' vs 'string'? PropertyValueKind matches PropertyDefinition valueKind.
        // except PropertyDefinition schema says valueKind is 'text', 'number' etc.
        // PropertyValue.kind is 'text', 'number'.
        // So they should match.
        errors.push({
            path: [def.name],
            message: `Property '${def.name}' expected type '${def.valueKind}' but got '${val.kind}'`,
            expected: def.valueKind,
            actual: val.kind
        })
    }

    // Additional checks per kind?
    if (def.valueKind === 'reference' && val.kind === 'reference') {
        // "value must be valid NodeId, optionally check targetType exists"
        // It is already a NodeId if it is a ReferenceValue.
    }

    return errors
}

export function validateNode(graph: Graph, node: Node): ValidationResult {
    const errors: ValidationError[] = []

    // 1. Lookup NodeType
    const defNode = getNodeType(graph, node.type)
    if (!defNode) {
        // "Handle missing NodeType gracefully: ... warn or allow"
        // "System/bootstrap types should always be valid"
        // If it's a missing definition, we can't validate properties.
        // Return valid for now (loose mode).
        return SUCCESS
    }

    const def = extractNodeTypeDefinition(defNode)

    // 2. Validate properties
    for (const propDef of def.properties) {
        const val = node.properties.get(propDef.name)

        if (propDef.required && val === undefined) {
            errors.push({
                path: [propDef.name],
                message: `Missing required property '${propDef.name}'`,
                expected: 'defined',
                actual: 'undefined'
            })
            continue
        }

        if (val !== undefined) {
            errors.push(...validateValue(val, propDef))
        }
    }

    // Check for unknown properties? (Strict schema?)
    // Prompt doesn't explicitly ask to ban unknown properties, but "Validate property types match".
    // Usually schemas are open or closed. Let's assume open for now unless specified.

    if (errors.length > 0) {
        return failure(errors)
    }

    return SUCCESS
}

export function validateEdge(graph: Graph, edge: Edge): ValidationResult {
    const errors: ValidationError[] = []

    // 1. Lookup EdgeType
    // We need a getEdgeType similar to getNodeType
    // For now, let's implement inline lookup
    let defNode: Node | undefined
    const edgeTypeId = asNodeId(edge.type) // Assuming definition ID matches TypeId
    defNode = graph.nodes.get(edgeTypeId)

    // If not found by ID, maybe by name? But edges usually use TypeId directly.
    // Also check if it's actually an edge type
    if (defNode && defNode.type !== SYSTEM_IDS.EDGE_TYPE) {
        defNode = undefined
    }

    if (!defNode) {
        return SUCCESS
    }

    const def = extractEdgeTypeDefinition(defNode)
    if (!def) return SUCCESS

    // 2. Validate source/target types
    if (def.sourceTypes.length > 0) {
        const sourceNode = graph.nodes.get(edge.source)
        if (sourceNode) {
            if (!def.sourceTypes.includes(sourceNode.type)) {
                // Check inheritance? Prompt says "Validates source node type is in sourceTypes array"
                // Simple inclusion for now.
                errors.push({
                    path: ['source'],
                    message: `Source node type '${sourceNode.type}' is not allowed for edge type '${edge.type}'`,
                    expected: def.sourceTypes.join(' | '),
                    actual: sourceNode.type
                })
            }
        } else {
             // Edge source missing? Graph integrity issue, but out of scope for schema validation?
             // Or maybe validEdge assumes nodes exist.
        }
    }

    if (def.targetTypes.length > 0) {
        const targetNode = graph.nodes.get(edge.target)
        if (targetNode) {
            if (!def.targetTypes.includes(targetNode.type)) {
                errors.push({
                    path: ['target'],
                    message: `Target node type '${targetNode.type}' is not allowed for edge type '${edge.type}'`,
                    expected: def.targetTypes.join(' | '),
                    actual: targetNode.type
                })
            }
        }
    }

    // 3. Validate properties
    for (const propDef of def.properties) {
        const val = edge.properties.get(propDef.name)

        if (propDef.required && val === undefined) {
            errors.push({
                path: [propDef.name],
                message: `Missing required property '${propDef.name}'`,
                expected: 'defined',
                actual: 'undefined'
            })
            continue
        }

        if (val !== undefined) {
            errors.push(...validateValue(val, propDef))
        }
    }

    if (errors.length > 0) {
        return failure(errors)
    }

    return SUCCESS
}
