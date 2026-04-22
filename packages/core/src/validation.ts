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
} from '@canopy/types';
import { asTypeId, asNodeId, fromThrowable } from '@canopy/types';
import { PropertyDefinitionSchema } from '@canopy/schema';
import { getNodeType } from './queries';
import { SYSTEM_IDS } from './system';
import { pipe, map, flatMap, filter } from 'remeda';

export const getNodeTypeDefinition = getNodeType;

// Helper to create a success result
const SUCCESS: ValidationResult = { valid: true, errors: [] };

// Helper to create an error result
const failure = (errors: readonly ValidationError[]): ValidationResult => ({
  valid: false,
  errors,
});

// Extract properties from a definition node
function extractProperties(node: Node): readonly PropertyDefinition[] {
  const prop = node.properties.get('properties');
  if (typeof prop !== 'string') {
    return [];
  }

  const raw = fromThrowable(() => JSON.parse(prop));
  if (raw.ok && Array.isArray(raw.value)) {
    // Validate against schema using Zod safely
    const result = PropertyDefinitionSchema.array().safeParse(raw.value);
    if (result.success) {
      return result.data;
    }
  }
  return [];
}

// Extract a list of TypeIds from a property value (supports both array and JSON string formats)
function extractTypeIdList(val: PropertyValue | undefined): readonly TypeId[] {
  if (val === undefined) {
    return [];
  }
  if (Array.isArray(val)) {
    return val.map((i) => (typeof i === 'string' ? asTypeId(i) : asTypeId('unknown')));
  }
  if (typeof val === 'string') {
    const result = fromThrowable(() => JSON.parse(val) as readonly string[]);
    if (result.ok && Array.isArray(result.value)) {
      return result.value.map(asTypeId);
    }
    return [];
  }
  return [];
}

function extractEdgeTypeDefinition(node: Node): EdgeTypeDefinition | undefined {
  const name = node.properties.get('name');
  const description = node.properties.get('description');

  const namespaceProp = node.properties.get('namespace');
  const namespace: import('@canopy/types').Namespace =
    namespaceProp === 'system' ||
    namespaceProp === 'user' ||
    namespaceProp === 'imported' ||
    namespaceProp === 'user-settings'
      ? (namespaceProp as import('@canopy/types').Namespace)
      : 'user';

  const properties = extractProperties(node);

  const sourceTypes = extractTypeIdList(node.properties.get('sourceTypes'));
  const targetTypes = extractTypeIdList(node.properties.get('targetTypes'));

  const transitiveProp = node.properties.get('transitive');
  const transitive = transitiveProp === true;

  const inverseProp = node.properties.get('inverse');
  const inverse = typeof inverseProp === 'string' ? asTypeId(inverseProp) : undefined;

  return {
    id: asTypeId(node.id),
    name: typeof name === 'string' ? name : 'Unknown',
    namespace,
    description: typeof description === 'string' ? description : undefined,
    properties,
    sourceTypes,
    targetTypes,
    transitive,
    inverse,
  };
}

function extractNodeTypeDefinition(node: Node): NodeTypeDefinition {
  const properties = extractProperties(node);

  const name = node.properties.get('name');
  const description = node.properties.get('description');

  const namespaceProp = node.properties.get('namespace');
  const namespace: import('@canopy/types').Namespace =
    namespaceProp === 'system' ||
    namespaceProp === 'user' ||
    namespaceProp === 'imported' ||
    namespaceProp === 'user-settings'
      ? (namespaceProp as import('@canopy/types').Namespace)
      : 'user';

  const validOutgoingEdges = extractTypeIdList(node.properties.get('validOutgoingEdges'));
  const validIncomingEdges = extractTypeIdList(node.properties.get('validIncomingEdges'));

  return {
    id: asTypeId(node.id),
    name: typeof name === 'string' ? name : 'Unknown',
    namespace,
    description: typeof description === 'string' ? description : undefined,
    properties,
    validOutgoingEdges,
    validIncomingEdges,
  };
}

function validateValue(val: PropertyValue, def: PropertyDefinition): readonly ValidationError[] {
  const isValid = (): boolean => {
    if (def.valueKind === 'list') {
      return Array.isArray(val);
    }

    if (Array.isArray(val)) {
      return false;
    }

    switch (def.valueKind) {
      case 'text':
      case 'instant':
      case 'plain-date':
      case 'reference': {
        return typeof val === 'string';
      }
      case 'number': {
        return typeof val === 'number';
      }
      case 'boolean': {
        return typeof val === 'boolean';
      }
      case 'external-reference': {
        return typeof val === 'object' && val !== null && 'graph' in val;
      }
      default: {
        return false;
      }
    }
  };

  if (!isValid()) {
    return [
      {
        path: [def.name],
        message: `Property '${def.name}' expected type '${def.valueKind}' but got incompatible value`,
        expected: def.valueKind,
        actual: Array.isArray(val) ? 'list' : typeof val,
      },
    ];
  }

  return [];
}

function validateProperties(
  properties: ReadonlyMap<string, PropertyValue>,
  definitions: readonly PropertyDefinition[],
): readonly ValidationError[] {
  return pipe(
    definitions,
    flatMap((propDef): readonly ValidationError[] => {
      const val = properties.get(propDef.name);

      if (propDef.required && val === undefined) {
        return [
          {
            path: [propDef.name],
            message: `Missing required property '${propDef.name}'`,
            expected: 'defined',
            actual: 'undefined',
          },
        ];
      }

      if (val !== undefined) {
        return validateValue(val, propDef);
      }
      return [];
    }),
  );
}

export function validateNode(graph: Graph, node: Node): ValidationResult {
  // 1. Lookup NodeType
  const defNode = getNodeTypeDefinition(graph, node.type);
  if (!defNode) {
    return SUCCESS;
  }

  const def = extractNodeTypeDefinition(defNode);

  // 2. Validate properties
  const errors = validateProperties(node.properties, def.properties);

  if (errors.length > 0) {
    return failure(errors);
  }

  return SUCCESS;
}

// Validate edge constraints from the node type side (validOutgoingEdges / validIncomingEdges)
function validateNodeTypeEdgeConstraints(graph: Graph, edge: Edge): readonly ValidationError[] {
  const sourceNode = graph.nodes.get(edge.source);
  const targetNode = graph.nodes.get(edge.target);

  const sourceErrors: readonly ValidationError[] = (() => {
    if (!sourceNode) return [];
    const sourceTypeDef = getNodeTypeDefinition(graph, sourceNode.type);
    if (!sourceTypeDef) return [];
    const sourceDef = extractNodeTypeDefinition(sourceTypeDef);
    if (sourceDef.validOutgoingEdges.length === 0) return [];
    if (sourceDef.validOutgoingEdges.includes(edge.type)) return [];
    return [
      {
        path: ['source'],
        message: `Source node type '${sourceDef.name}' does not allow outgoing edge type '${edge.type}'`,
        expected: sourceDef.validOutgoingEdges.join(' | '),
        actual: edge.type,
      },
    ];
  })();

  const targetErrors: readonly ValidationError[] = (() => {
    if (!targetNode) return [];
    const targetTypeDef = getNodeTypeDefinition(graph, targetNode.type);
    if (!targetTypeDef) return [];
    const targetDef = extractNodeTypeDefinition(targetTypeDef);
    if (targetDef.validIncomingEdges.length === 0) return [];
    if (targetDef.validIncomingEdges.includes(edge.type)) return [];
    return [
      {
        path: ['target'],
        message: `Target node type '${targetDef.name}' does not allow incoming edge type '${edge.type}'`,
        expected: targetDef.validIncomingEdges.join(' | '),
        actual: edge.type,
      },
    ];
  })();

  return [...sourceErrors, ...targetErrors];
}

export function validateEdge(graph: Graph, edge: Edge): ValidationResult {
  // 1. Lookup EdgeType
  const edgeTypeId = asNodeId(edge.type);
  const rawDefNode = graph.nodes.get(edgeTypeId);
  const defNode = rawDefNode && rawDefNode.type === SYSTEM_IDS.EDGE_TYPE ? rawDefNode : undefined;

  // 2. Validate edge-type-level constraints (source/target types, properties)
  const edgeTypeErrors: readonly ValidationError[] = (() => {
    if (!defNode) return [];
    const def = extractEdgeTypeDefinition(defNode);
    if (!def) return [];

    const sourceErrors = pipe(
      [edge.source],
      map((id) => graph.nodes.get(id)),
      filter((node): node is Node => !!node),
      flatMap((node) => {
        if (def.sourceTypes.length > 0 && !def.sourceTypes.includes(node.type)) {
          return [
            {
              path: ['source'],
              message: `Source node type '${node.type}' is not allowed for edge type '${edge.type}'`,
              expected: def.sourceTypes.join(' | '),
              actual: node.type,
            },
          ];
        }
        return [];
      }),
    );

    const targetErrors = pipe(
      [edge.target],
      map((id) => graph.nodes.get(id)),
      filter((node): node is Node => !!node),
      flatMap((node) => {
        if (def.targetTypes.length > 0 && !def.targetTypes.includes(node.type)) {
          return [
            {
              path: ['target'],
              message: `Target node type '${node.type}' is not allowed for edge type '${edge.type}'`,
              expected: def.targetTypes.join(' | '),
              actual: node.type,
            },
          ];
        }
        return [];
      }),
    );

    const propertyErrors = validateProperties(edge.properties, def.properties);

    return [...sourceErrors, ...targetErrors, ...propertyErrors];
  })();

  // 3. Validate node-type-level edge constraints (validOutgoingEdges / validIncomingEdges)
  const nodeTypeErrors = validateNodeTypeEdgeConstraints(graph, edge);

  const errors = [...edgeTypeErrors, ...nodeTypeErrors];

  if (errors.length > 0) {
    return failure(errors);
  }

  return SUCCESS;
}
