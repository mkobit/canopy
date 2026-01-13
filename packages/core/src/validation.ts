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
import { asTypeId, asNodeId } from '@canopy/types';
import { PropertyDefinitionSchema } from '@canopy/schema';
import { getNodeType } from './queries';
import { SYSTEM_IDS } from './system';
import { pipe, map, flatMap, filter } from 'remeda';

// Helper to create a success result
const SUCCESS: ValidationResult = { valid: true, errors: [] };

// Helper to create an error result
function failure(errors: readonly ValidationError[]): ValidationResult {
  return { valid: false, errors };
}

// Extract properties from a definition node
function extractProperties(node: Node): readonly PropertyDefinition[] {
  const prop = node.properties.get('properties');
  if (!prop || prop.kind !== 'text') {
    return [];
  }
  // eslint-disable-next-line functional/no-try-statements
  try {
    const raw = JSON.parse(prop.value);
    if (Array.isArray(raw)) {
      // Validate against schema using Zod safely
      const result = PropertyDefinitionSchema.array().safeParse(raw);
      if (result.success) {
        return result.data;
      }
    }
  } catch {
    // ignore parse error, return empty
  }
  return [];
}

function extractEdgeTypeDefinition(node: Node): EdgeTypeDefinition | undefined {
  const name = node.properties.get('name');
  const description = node.properties.get('description');

  const properties = extractProperties(node);

  const sourceTypesVal = node.properties.get('sourceTypes');
  const targetTypesVal = node.properties.get('targetTypes');

  const sourceTypes: readonly TypeId[] = (() => {
    if (sourceTypesVal?.kind === 'list') {
      return sourceTypesVal.items.map((i) =>
        i.kind === 'text' ? asTypeId(i.value) : asTypeId('unknown'),
      );
    }
    if (sourceTypesVal?.kind === 'text') {
      // eslint-disable-next-line functional/no-try-statements
      try {
        return (JSON.parse(sourceTypesVal.value) as readonly string[]).map(asTypeId);
      } catch {
        return [];
      }
    }
    return [];
  })();

  const targetTypes: readonly TypeId[] = (() => {
    if (targetTypesVal?.kind === 'list') {
      return targetTypesVal.items.map((i) =>
        i.kind === 'text' ? asTypeId(i.value) : asTypeId('unknown'),
      );
    }
    if (targetTypesVal?.kind === 'text') {
      // eslint-disable-next-line functional/no-try-statements
      try {
        return (JSON.parse(targetTypesVal.value) as readonly string[]).map(asTypeId);
      } catch {
        return [];
      }
    }
    return [];
  })();

  return {
    id: asTypeId(node.id),
    name: name?.kind === 'text' ? name.value : 'Unknown',
    description: description?.kind === 'text' ? description.value : undefined,
    properties,
    sourceTypes,
    targetTypes,
    transitive: false, // TODO
    inverse: undefined, // TODO
  };
}

function extractNodeTypeDefinition(node: Node): NodeTypeDefinition {
  const properties = extractProperties(node);

  const name = node.properties.get('name');
  const description = node.properties.get('description');

  return {
    id: asTypeId(node.id),
    name: name?.kind === 'text' ? name.value : 'Unknown',
    description: description?.kind === 'text' ? description.value : undefined,
    properties,
    validOutgoingEdges: [], // TODO
    validIncomingEdges: [], // TODO
  };
}

function validateValue(val: PropertyValue, def: PropertyDefinition): readonly ValidationError[] {
  // Check kind
  if (val.kind !== def.valueKind) {
    return [
      {
        path: [def.name],
        message: `Property '${def.name}' expected type '${def.valueKind}' but got '${val.kind}'`,
        expected: def.valueKind,
        actual: val.kind,
      },
    ];
  }

  // Additional checks per kind?
  if (def.valueKind === 'reference' && val.kind === 'reference') {
    // "value must be valid NodeId, optionally check targetType exists"
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
  const defNode = getNodeType(graph, node.type);
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

export function validateEdge(graph: Graph, edge: Edge): ValidationResult {
  // 1. Lookup EdgeType
  const edgeTypeId = asNodeId(edge.type);
  const rawDefNode = graph.nodes.get(edgeTypeId);
  const defNode = rawDefNode && rawDefNode.type === SYSTEM_IDS.EDGE_TYPE ? rawDefNode : undefined;

  if (!defNode) {
    return SUCCESS;
  }

  const def = extractEdgeTypeDefinition(defNode);
  if (!def) return SUCCESS;

  // 2. Validate source/target types
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

  // 3. Validate properties
  const propertyErrors = validateProperties(edge.properties, def.properties);

  const errors = [...sourceErrors, ...targetErrors, ...propertyErrors];

  if (errors.length > 0) {
    return failure(errors);
  }

  return SUCCESS;
}
