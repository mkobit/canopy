import type { Graph } from './graph';
import type { Node } from './node';
import type { Edge } from './edge';
import type { NodeTypeDefinition, EdgeTypeDefinition } from './definitions';
import type { ValidationResult, ValidationError } from './validation-types';
import type { PropertyDefinition, PropertyValue, PropertyValueKind } from './properties';
import type { NodeId, TypeId, Namespace } from './identifiers';
import { asTypeId, asNodeId, asNamespace } from './factories';
import { fromThrowable } from './result';
import { PropertyDefinitionSchema } from './schemas';
import { getNodeType } from './queries';
import { parseNamespace } from './resolve-namespace';
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
    return val.map((i) => asTypeId(typeof i === 'string' ? i : 'unknown'));
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

// Resolves a raw 'namespace' property value against known Namespace nodes, defaulting to 'user'.
function extractNamespace(graph: Graph, namespaceProp: PropertyValue | undefined): Namespace {
  if (typeof namespaceProp === 'string') {
    const parsed = parseNamespace(graph, namespaceProp);
    if (parsed.ok) {
      return parsed.value;
    }
  }
  return asNamespace('user');
}

function extractEdgeTypeDefinition(graph: Graph, node: Node): EdgeTypeDefinition | undefined {
  const name = node.properties.get('name');
  const description = node.properties.get('description');

  const namespace = extractNamespace(graph, node.properties.get('namespace'));

  const properties = extractProperties(node);

  const sourceTypes = extractTypeIdList(node.properties.get('sourceTypes'));
  const targetTypes = extractTypeIdList(node.properties.get('targetTypes'));

  const transitiveProp = node.properties.get('transitive');
  const isTransitive = transitiveProp === true;

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
    transitive: isTransitive,
    inverse,
  };
}

function extractNodeTypeDefinition(graph: Graph, node: Node): NodeTypeDefinition {
  const properties = extractProperties(node);

  const name = node.properties.get('name');
  const description = node.properties.get('description');

  const namespace = extractNamespace(graph, node.properties.get('namespace'));

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

function validateRegex(
  val: PropertyValue,
  name: string,
  rxStr: string,
): readonly ValidationError[] {
  const rxResult = fromThrowable(() => new RegExp(rxStr));
  if (!rxResult.ok) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' has an invalid regular expression constraint`,
        expected: 'valid regex',
        actual: rxStr,
      },
    ];
  }

  const rx = rxResult.value;
  if (typeof val === 'string' && val.length > 8192) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' is too long for pattern validation (max 8192 characters)`,
        expected: `<= 8192 characters`,
        actual: String(val.length),
      },
    ];
  }
  if (typeof val === 'string' && !rx.test(val)) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' does not match the required pattern`,
        expected: rxStr,
        actual: val,
      },
    ];
  }
  if (Array.isArray(val)) {
    return val
      .map((item, index): ValidationError | null => {
        if (typeof item !== 'string') {
          return {
            path: [name, String(index)] as readonly string[],
            message: `Property '${name}' element at index ${index} does not match the required pattern`,
            expected: rxStr,
            actual: String(item),
          };
        }
        if (item.length > 8192) {
          return {
            path: [name, String(index)] as readonly string[],
            message: `Property '${name}' element at index ${index} is too long for pattern validation (max 8192 characters)`,
            expected: `<= 8192 characters`,
            actual: String(item.length),
          };
        }
        if (!rx.test(item)) {
          return {
            path: [name, String(index)] as readonly string[],
            message: `Property '${name}' element at index ${index} does not match the required pattern`,
            expected: rxStr,
            actual: item,
          };
        }
        return null;
      })
      .filter((err): err is ValidationError => err !== null);
  }
  return [];
}

function validateChoices(
  val: PropertyValue,
  name: string,
  choices: readonly string[],
): readonly ValidationError[] {
  if (typeof val === 'string' && !choices.includes(val)) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be one of the allowed choices`,
        expected: choices.join(', '),
        actual: val,
      },
    ];
  }
  if (Array.isArray(val)) {
    return val
      .map((item, index): ValidationError | null => {
        if (typeof item !== 'string' || !choices.includes(item)) {
          return {
            path: [name, String(index)] as readonly string[],
            message: `Property '${name}' element at index ${index} must be one of the allowed choices`,
            expected: choices.join(', '),
            actual: typeof item === 'string' ? item : String(item),
          };
        }
        return null;
      })
      .filter((err): err is ValidationError => err !== null);
  }
  return [];
}

function validateMin(val: PropertyValue, name: string, limit: number): readonly ValidationError[] {
  if (typeof val === 'number' && val < limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at least ${limit}`,
        expected: `>= ${limit}`,
        actual: String(val),
      },
    ];
  }
  if (typeof val === 'string' && val.length < limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at least ${limit} characters long`,
        expected: `>= ${limit}`,
        actual: String(val.length),
      },
    ];
  }
  if (Array.isArray(val) && val.length < limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must contain at least ${limit} items`,
        expected: `>= ${limit}`,
        actual: String(val.length),
      },
    ];
  }
  return [];
}

function validateMax(val: PropertyValue, name: string, limit: number): readonly ValidationError[] {
  if (typeof val === 'number' && val > limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at most ${limit}`,
        expected: `<= ${limit}`,
        actual: String(val),
      },
    ];
  }
  if (typeof val === 'string' && val.length > limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at most ${limit} characters long`,
        expected: `<= ${limit}`,
        actual: String(val.length),
      },
    ];
  }
  if (Array.isArray(val) && val.length > limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must contain at most ${limit} items`,
        expected: `<= ${limit}`,
        actual: String(val.length),
      },
    ];
  }
  return [];
}

function validateValue(val: PropertyValue, def: PropertyDefinition): readonly ValidationError[] {
  if (val === null && def.nullable === true) {
    return [];
  }

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

  const regexErrors = def.regex === undefined ? [] : validateRegex(val, def.name, def.regex);
  const choicesErrors =
    def.choices === undefined ? [] : validateChoices(val, def.name, def.choices);
  const minErrors = def.min === undefined ? [] : validateMin(val, def.name, def.min);
  const maxErrors = def.max === undefined ? [] : validateMax(val, def.name, def.max);

  return [...regexErrors, ...choicesErrors, ...minErrors, ...maxErrors];
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

  const def = extractNodeTypeDefinition(graph, defNode);

  // 2. Validate properties
  const errors = validateProperties(node.properties, def.properties);

  if (errors.length > 0) {
    return failure(errors);
  }

  return SUCCESS;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function matchesCondition(payload: Record<string, any>, conditionJson: string): boolean {
  const result = fromThrowable(() => JSON.parse(conditionJson));

  if (!result.ok) {
    return false;
  }

  const condition = result.value;

  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditionRecord = condition as Record<string, any>;
  return Object.entries(conditionRecord).every(([key, value]) => payload[key] === value);
}

export function validatePropertyByType(
  graph: Graph,
  propertyTypeId: NodeId,
  value: PropertyValue,
): ValidationResult {
  const defNode = graph.nodes.get(propertyTypeId);
  if (!defNode) {
    return failure([
      { path: [propertyTypeId], message: `PropertyType node '${propertyTypeId}' not found` },
    ]);
  }

  const nameProp = defNode.properties.get('name');
  const name = typeof nameProp === 'string' ? nameProp : 'unknown';

  const valueKindProp = defNode.properties.get('valueKind');
  if (typeof valueKindProp !== 'string') {
    return failure([
      {
        path: [name],
        message: `PropertyType node '${propertyTypeId}' missing 'valueKind' property`,
      },
    ]);
  }

  const def: PropertyDefinition = {
    name,
    valueKind: valueKindProp as PropertyValueKind,
    required: true,
    description: undefined,
  };

  const errors = validateValue(value, def);
  if (errors.length > 0) {
    return failure(errors);
  }

  return SUCCESS;
}

export function isEdgeCompatible(
  def: EdgeTypeDefinition,
  sourceType: TypeId,
  targetType: TypeId,
): boolean {
  const isSourceOk = def.sourceTypes.length === 0 || def.sourceTypes.includes(sourceType);
  const isTargetOk = def.targetTypes.length === 0 || def.targetTypes.includes(targetType);
  return isSourceOk && isTargetOk;
}

// Validate edge constraints from the node type side (validOutgoingEdges / validIncomingEdges)
function validateNodeTypeEdgeConstraints(graph: Graph, edge: Edge): readonly ValidationError[] {
  const sourceNode = graph.nodes.get(edge.source);
  const targetNode = graph.nodes.get(edge.target);

  const sourceErrors: readonly ValidationError[] = (() => {
    if (!sourceNode) return [];
    const sourceTypeDef = getNodeTypeDefinition(graph, sourceNode.type);
    if (!sourceTypeDef) return [];
    const sourceDef = extractNodeTypeDefinition(graph, sourceTypeDef);
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
    const targetDef = extractNodeTypeDefinition(graph, targetTypeDef);
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
    const def = extractEdgeTypeDefinition(graph, defNode);
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
