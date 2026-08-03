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
import { validateWasmBinaryProperty, validatePluginManifestProperty } from './plugin-validation';

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
  const property = node.properties.get('properties');
  if (typeof property !== 'string') {
    return [];
  }

  const raw = fromThrowable(() => JSON.parse(property));
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
function extractTypeIdList(value: PropertyValue | undefined): readonly TypeId[] {
  if (value === undefined) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((index) => asTypeId(typeof index === 'string' ? index : 'unknown'));
  }
  if (typeof value === 'string') {
    const result = fromThrowable(() => JSON.parse(value) as readonly string[]);
    if (result.ok && Array.isArray(result.value)) {
      return result.value.map(asTypeId);
    }
    return [];
  }
  return [];
}

// Resolves a raw 'namespace' property value against known Namespace nodes, defaulting to 'user'.
function extractNamespace(graph: Graph, namespaceProperty: PropertyValue | undefined): Namespace {
  if (typeof namespaceProperty === 'string') {
    const parsed = parseNamespace(graph, namespaceProperty);
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

  const transitiveProperty = node.properties.get('transitive');
  const isTransitive = transitiveProperty === true;

  const inverseProperty = node.properties.get('inverse');
  const inverse = typeof inverseProperty === 'string' ? asTypeId(inverseProperty) : undefined;

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
  value: PropertyValue,
  name: string,
  rxString: string,
): readonly ValidationError[] {
  const rxResult = fromThrowable(() => new RegExp(rxString));
  if (!rxResult.ok) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' has an invalid regular expression constraint`,
        expected: 'valid regex',
        actual: rxString,
      },
    ];
  }

  const rx = rxResult.value;
  if (typeof value === 'string' && value.length > 8192) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' is too long for pattern validation (max 8192 characters)`,
        expected: `<= 8192 characters`,
        actual: String(value.length),
      },
    ];
  }
  if (typeof value === 'string' && !rx.test(value)) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' does not match the required pattern`,
        expected: rxString,
        actual: value,
      },
    ];
  }
  if (Array.isArray(value)) {
    return value
      .map((item, index): ValidationError | null => {
        if (typeof item !== 'string') {
          return {
            path: [name, String(index)] as readonly string[],
            message: `Property '${name}' element at index ${index} does not match the required pattern`,
            expected: rxString,
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
            expected: rxString,
            actual: item,
          };
        }
        return null;
      })
      .filter((error): error is ValidationError => error !== null);
  }
  return [];
}

function validateChoices(
  value: PropertyValue,
  name: string,
  choices: readonly string[],
): readonly ValidationError[] {
  if (typeof value === 'string' && !choices.includes(value)) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be one of the allowed choices`,
        expected: choices.join(', '),
        actual: value,
      },
    ];
  }
  if (Array.isArray(value)) {
    return value
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
      .filter((error): error is ValidationError => error !== null);
  }
  return [];
}

function validateMin(
  value: PropertyValue,
  name: string,
  limit: number,
): readonly ValidationError[] {
  if (typeof value === 'number' && value < limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at least ${limit}`,
        expected: `>= ${limit}`,
        actual: String(value),
      },
    ];
  }
  if (typeof value === 'string' && value.length < limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at least ${limit} characters long`,
        expected: `>= ${limit}`,
        actual: String(value.length),
      },
    ];
  }
  if (Array.isArray(value) && value.length < limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must contain at least ${limit} items`,
        expected: `>= ${limit}`,
        actual: String(value.length),
      },
    ];
  }
  return [];
}

function validateMax(
  value: PropertyValue,
  name: string,
  limit: number,
): readonly ValidationError[] {
  if (typeof value === 'number' && value > limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at most ${limit}`,
        expected: `<= ${limit}`,
        actual: String(value),
      },
    ];
  }
  if (typeof value === 'string' && value.length > limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must be at most ${limit} characters long`,
        expected: `<= ${limit}`,
        actual: String(value.length),
      },
    ];
  }
  if (Array.isArray(value) && value.length > limit) {
    return [
      {
        path: [name] as readonly string[],
        message: `Property '${name}' must contain at most ${limit} items`,
        expected: `<= ${limit}`,
        actual: String(value.length),
      },
    ];
  }
  return [];
}

function validateValue(
  value: PropertyValue,
  definition: PropertyDefinition,
): readonly ValidationError[] {
  if (value === null && definition.nullable === true) {
    return [];
  }

  const isValid = (): boolean => {
    if (definition.valueKind === 'list') {
      return Array.isArray(value);
    }

    if (Array.isArray(value)) {
      return false;
    }

    switch (definition.valueKind) {
      case 'text':
      case 'instant':
      case 'plain-date':
      case 'reference': {
        return typeof value === 'string';
      }
      case 'number': {
        return typeof value === 'number';
      }
      case 'boolean': {
        return typeof value === 'boolean';
      }
      case 'external-reference': {
        return typeof value === 'object' && value !== null && 'graph' in value;
      }
      default: {
        return false;
      }
    }
  };

  if (!isValid()) {
    return [
      {
        path: [definition.name],
        message: `Property '${definition.name}' expected type '${definition.valueKind}' but got incompatible value`,
        expected: definition.valueKind,
        actual: Array.isArray(value) ? 'list' : typeof value,
      },
    ];
  }

  const regexErrors =
    definition.regex === undefined ? [] : validateRegex(value, definition.name, definition.regex);
  const choicesErrors =
    definition.choices === undefined
      ? []
      : validateChoices(value, definition.name, definition.choices);
  const minErrors =
    definition.min === undefined ? [] : validateMin(value, definition.name, definition.min);
  const maxErrors =
    definition.max === undefined ? [] : validateMax(value, definition.name, definition.max);

  return [...regexErrors, ...choicesErrors, ...minErrors, ...maxErrors];
}

function validateProperties(
  properties: ReadonlyMap<string, PropertyValue>,
  definitions: readonly PropertyDefinition[],
): readonly ValidationError[] {
  return pipe(
    definitions,
    flatMap((propertyDefinition): readonly ValidationError[] => {
      const value = properties.get(propertyDefinition.name);

      if (value === undefined && propertyDefinition.required) {
        return [
          {
            path: [propertyDefinition.name],
            message: `Missing required property '${propertyDefinition.name}'`,
            expected: 'defined',
            actual: 'undefined',
          },
        ];
      }

      if (value !== undefined) {
        return validateValue(value, propertyDefinition);
      }
      return [];
    }),
  );
}

export function validateNode(graph: Graph, node: Node): ValidationResult {
  // 1. Lookup NodeType
  const definitionNode = getNodeTypeDefinition(graph, node.type);
  if (!definitionNode) {
    return SUCCESS;
  }

  const definition = extractNodeTypeDefinition(graph, definitionNode);

  // 2. Validate properties
  const errors = validateProperties(node.properties, definition.properties);

  const wasmBinaryValue = node.properties.get('wasm_binary');
  const manifestValue = node.properties.get('manifest');

  const pluginErrors =
    node.type === SYSTEM_IDS.TYPE_PLUGIN
      ? [
          ...(wasmBinaryValue === undefined
            ? []
            : validateWasmBinaryProperty(wasmBinaryValue, 'wasm_binary')),
          ...(manifestValue === undefined
            ? []
            : validatePluginManifestProperty(manifestValue, 'manifest')),
        ]
      : [];

  const allErrors = [...errors, ...pluginErrors];

  if (allErrors.length > 0) {
    return failure(allErrors);
  }

  return SUCCESS;
}

export function matchesCondition(
  payload: Readonly<Record<string, unknown>>,
  conditionJson: string,
): boolean {
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
  const definitionNode = graph.nodes.get(propertyTypeId);
  if (!definitionNode) {
    return failure([
      { path: [propertyTypeId], message: `PropertyType node '${propertyTypeId}' not found` },
    ]);
  }

  const nameProperty = definitionNode.properties.get('name');
  const name = typeof nameProperty === 'string' ? nameProperty : 'unknown';

  const valueKindProperty = definitionNode.properties.get('valueKind');
  if (typeof valueKindProperty !== 'string') {
    return failure([
      {
        path: [name],
        message: `PropertyType node '${propertyTypeId}' missing 'valueKind' property`,
      },
    ]);
  }

  const definition: PropertyDefinition = {
    name,
    valueKind: valueKindProperty as PropertyValueKind,
    required: true,
    description: undefined,
  };

  const errors = validateValue(value, definition);
  if (errors.length > 0) {
    return failure(errors);
  }

  return SUCCESS;
}

export function isEdgeCompatible(
  definition: EdgeTypeDefinition,
  sourceType: TypeId,
  targetType: TypeId,
): boolean {
  const isSourceOk =
    definition.sourceTypes.length === 0 || definition.sourceTypes.includes(sourceType);
  const isTargetOk =
    definition.targetTypes.length === 0 || definition.targetTypes.includes(targetType);
  return isSourceOk && isTargetOk;
}

// Validate edge constraints from the node type side (validOutgoingEdges / validIncomingEdges)
function validateNodeTypeEdgeConstraints(graph: Graph, edge: Edge): readonly ValidationError[] {
  const sourceNode = graph.nodes.get(edge.source);
  const targetNode = graph.nodes.get(edge.target);

  const sourceErrors: readonly ValidationError[] = (() => {
    if (!sourceNode) return [];
    const sourceTypeDefinition = getNodeTypeDefinition(graph, sourceNode.type);
    if (!sourceTypeDefinition) return [];
    const sourceDefinition = extractNodeTypeDefinition(graph, sourceTypeDefinition);
    if (sourceDefinition.validOutgoingEdges.length === 0) return [];
    if (sourceDefinition.validOutgoingEdges.includes(edge.type)) return [];
    return [
      {
        path: ['source'],
        message: `Source node type '${sourceDefinition.name}' does not allow outgoing edge type '${edge.type}'`,
        expected: sourceDefinition.validOutgoingEdges.join(' | '),
        actual: edge.type,
      },
    ];
  })();

  const targetErrors: readonly ValidationError[] = (() => {
    if (!targetNode) return [];
    const targetTypeDefinition = getNodeTypeDefinition(graph, targetNode.type);
    if (!targetTypeDefinition) return [];
    const targetDefinition = extractNodeTypeDefinition(graph, targetTypeDefinition);
    if (targetDefinition.validIncomingEdges.length === 0) return [];
    if (targetDefinition.validIncomingEdges.includes(edge.type)) return [];
    return [
      {
        path: ['target'],
        message: `Target node type '${targetDefinition.name}' does not allow incoming edge type '${edge.type}'`,
        expected: targetDefinition.validIncomingEdges.join(' | '),
        actual: edge.type,
      },
    ];
  })();

  return [...sourceErrors, ...targetErrors];
}

export function validateEdge(graph: Graph, edge: Edge): ValidationResult {
  // 1. Lookup EdgeType
  const edgeTypeId = asNodeId(edge.type);
  const rawDefinitionNode = graph.nodes.get(edgeTypeId);
  const definitionNode =
    rawDefinitionNode && rawDefinitionNode.type === SYSTEM_IDS.EDGE_TYPE
      ? rawDefinitionNode
      : undefined;

  // 2. Validate edge-type-level constraints (source/target types, properties)
  const edgeTypeErrors: readonly ValidationError[] = (() => {
    if (!definitionNode) return [];
    const definition = extractEdgeTypeDefinition(graph, definitionNode);
    if (!definition) return [];

    const sourceErrors = pipe(
      [edge.source],
      map((id) => graph.nodes.get(id)),
      filter((node): node is Node => !!node),
      flatMap((node) => {
        if (definition.sourceTypes.length > 0 && !definition.sourceTypes.includes(node.type)) {
          return [
            {
              path: ['source'],
              message: `Source node type '${node.type}' is not allowed for edge type '${edge.type}'`,
              expected: definition.sourceTypes.join(' | '),
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
        if (definition.targetTypes.length > 0 && !definition.targetTypes.includes(node.type)) {
          return [
            {
              path: ['target'],
              message: `Target node type '${node.type}' is not allowed for edge type '${edge.type}'`,
              expected: definition.targetTypes.join(' | '),
              actual: node.type,
            },
          ];
        }
        return [];
      }),
    );

    const propertyErrors = validateProperties(edge.properties, definition.properties);

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
