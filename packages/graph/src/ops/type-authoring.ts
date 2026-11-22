import type { Graph } from '../graph';
import type { Node } from '../node';
import type { Edge } from '../edge';
import type { PropertyTypeId, ShapeId } from '../identifiers';
import type { Result } from '../result';
import type { GraphResult } from '../events';
import type { ValidationError } from '../validation-types';
import type { PropertyValue, PropertyValueKind } from '../properties';
import type { ShapePropertyBinding } from '../definitions';
import type { NodeOperationOptions } from './node';
import { createNodeId, createEdgeId, createInstant, asNodeId, asShapeId } from '../factories';
import { ok, err as error } from '../result';
import { addNode } from './node';
import { addEdge } from './edge';
import { SYSTEM_IDS, SYSTEM_EDGE_SHAPES } from '../system';
import { RESTRICTED_NAMESPACE_KINDS } from '../namespace';
import { findShapeByName, getNodesOfShape } from '../queries';
import { NamespaceSchema, PropertyDefinitionSchema, PropertyValueKindSchema } from '../schemas';
import { extractPropertyTypeDefinition, validatePropertyConstraints } from '../validation';
import { canonicalizeUri } from '../url';

function findNamespaceNode(graph: Graph, name: string): Node | undefined {
  return getNodesOfShape(graph, SYSTEM_IDS.NAMESPACE).find(
    (node) => node.properties.get('name') === name,
  );
}

function checkNamespaceWritable(graph: Graph, name: string): Result<undefined, ValidationError> {
  const node = findNamespaceNode(graph, name);
  if (!node) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: ['namespace'],
      message: `Namespace '${name}' does not exist`,
    });
  }
  const kind = node.properties.get('kind');
  if (typeof kind === 'string' && RESTRICTED_NAMESPACE_KINDS.has(kind)) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: ['namespace'],
      message: `Namespace '${name}' is restricted (kind '${kind}') and cannot be written into`,
    });
  }
  return ok(undefined);
}

function fromAddNodeResult(
  result: Result<GraphResult<Graph>, Error>,
): Result<GraphResult<Graph>, ValidationError> {
  return result.ok
    ? result
    : error({ code: 'CONSTRAINT', severity: 'error', path: [], message: result.error.message });
}

export type CreateNamespaceInput = Readonly<{
  name: string;
  kind: string;
  description?: string | undefined;
}>;

/**
Creates a new Namespace node.
Rejects a duplicate `name` or a restricted `kind` (see `RESTRICTED_NAMESPACE_KINDS`).
*/
export function createNamespace(
  graph: Graph,
  input: CreateNamespaceInput,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const formatResult = NamespaceSchema.safeParse(input.name);
  if (!formatResult.success) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: ['name'],
      message: formatResult.error.issues[0]?.message ?? `Invalid namespace name '${input.name}'`,
    });
  }

  if (RESTRICTED_NAMESPACE_KINDS.has(input.kind)) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: ['kind'],
      message: `Namespace kind '${input.kind}' is restricted and cannot be created via this op`,
    });
  }

  if (findNamespaceNode(graph, input.name)) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: ['name'],
      message: `Namespace '${input.name}' already exists`,
    });
  }

  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    kind: input.kind,
    ...(input.description !== undefined && { description: input.description }),
  };

  const node: Node = {
    id: createNodeId(),
    shape: SYSTEM_IDS.NAMESPACE,
    properties: new Map(Object.entries(properties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return fromAddNodeResult(addNode(graph, node, options));
}

export type ShapePropertyInput =
  | Readonly<{
      kind: 'inline';
      name: string;
      valueKind: PropertyValueKind;
      required: boolean;
      description?: string | undefined;
      regex?: string | undefined;
      min?: number | undefined;
      max?: number | undefined;
      choices?: readonly string[] | undefined;
      nullable?: boolean | undefined;
      cardinality?: 'one' | 'many' | undefined;
      unique?: boolean | undefined;
      targetShapeId?: ShapeId | undefined;
      schemaOrgUri?: string | undefined;
    }>
  | Readonly<{
      kind: 'reference';
      propertyTypeId: PropertyTypeId;
      required: boolean;
      name?: string | undefined;
      cardinality?: 'one' | 'many' | undefined;
      description?: string | undefined;
    }>;

function resolvePropertyInput(
  graph: Graph,
  input: ShapePropertyInput,
  index: number,
): Result<ShapePropertyBinding, ValidationError> {
  if (input.kind === 'inline') {
    const valueKindResult = PropertyValueKindSchema.safeParse(input.valueKind);
    if (!valueKindResult.success) {
      return error({
        code: 'CONSTRAINT',
        severity: 'error',
        path: ['properties', String(index), 'valueKind'],
        message: `'${input.valueKind}' is not a valid PropertyValueKind`,
      });
    }
    if (valueKindResult.data === 'list') {
      return error({
        code: 'CONSTRAINT',
        severity: 'error',
        path: ['properties', String(index), 'valueKind'],
        message:
          "Value kind 'list' is deprecated for new authoring; use 'text' with cardinality 'many'",
      });
    }

    const parsed = PropertyDefinitionSchema.safeParse({
      name: input.name,
      valueKind: valueKindResult.data,
      required: input.required,
      ...(input.description !== undefined && { description: input.description }),
      ...(input.regex !== undefined && { regex: input.regex }),
      ...(input.min !== undefined && { min: input.min }),
      ...(input.max !== undefined && { max: input.max }),
      ...(input.choices !== undefined && { choices: input.choices }),
      ...(input.nullable !== undefined && { nullable: input.nullable }),
      ...(input.cardinality !== undefined && { cardinality: input.cardinality }),
      ...(input.unique !== undefined && { unique: input.unique }),
      ...(input.targetShapeId !== undefined && { targetShapeId: input.targetShapeId }),
      ...(input.schemaOrgUri !== undefined && { schemaOrgUri: input.schemaOrgUri }),
    });
    if (!parsed.success) {
      return error({
        code: 'SHAPE_MALFORMED',
        severity: 'error',
        path: ['properties', String(index)],
        message: parsed.error.issues.map((issue) => issue.message).join('; '),
      });
    }
    const constraintErrors = validatePropertyConstraints(parsed.data, 'CONSTRAINT');
    return constraintErrors.length > 0 && constraintErrors[0] !== undefined
      ? error(constraintErrors[0])
      : ok({ kind: 'inline', definition: parsed.data });
  }

  const referenceNode = graph.nodes.get(asNodeId(input.propertyTypeId));
  if (!referenceNode || referenceNode.shape !== SYSTEM_IDS.PROPERTY_TYPE) {
    return error({
      code: 'PROPERTY_TYPE_NOT_FOUND',
      severity: 'error',
      path: ['properties', String(index), 'propertyTypeId'],
      message: `PropertyType '${input.propertyTypeId}' does not exist`,
    });
  }

  const ptResult = extractPropertyTypeDefinition(referenceNode);
  if (!ptResult.ok) {
    return error({
      code: 'PROPERTY_TYPE_MALFORMED',
      severity: 'error',
      path: ['properties', String(index), 'propertyTypeId'],
      message: ptResult.error[0]?.message ?? `PropertyType '${input.propertyTypeId}' is malformed`,
    });
  }

  const pt = ptResult.value;
  const ptCardinality = pt.cardinality ?? (pt.valueKind === 'list' ? 'many' : 'one');
  if (ptCardinality === 'one' && input.cardinality === 'many') {
    return error({
      code: 'CARDINALITY_WIDENED',
      severity: 'error',
      path: ['properties', String(index), 'cardinality'],
      message: `Cannot widen PropertyType '${input.propertyTypeId}' cardinality from 'one' to 'many'`,
    });
  }

  return ok({
    kind: 'reference',
    name: input.name ?? pt.name,
    required: input.required,
    propertyTypeId: input.propertyTypeId,
    ...(input.cardinality !== undefined && { cardinality: input.cardinality }),
    ...(input.description !== undefined && { description: input.description }),
  });
}

function resolveBindings(
  graph: Graph,
  inputs: readonly ShapePropertyInput[],
  index = 0,
  resolved: readonly ShapePropertyBinding[] = [],
  seenNames: ReadonlySet<string> = new Set(),
): Result<readonly ShapePropertyBinding[], ValidationError> {
  const input = inputs[index];
  if (input === undefined) {
    return ok(resolved);
  }
  const result = resolvePropertyInput(graph, input, index);
  if (!result.ok) {
    return result;
  }
  const bindingName =
    result.value.kind === 'inline' ? result.value.definition.name : result.value.name;
  if (seenNames.has(bindingName)) {
    return error({
      code: 'SHAPE_MALFORMED',
      severity: 'error',
      path: ['properties', String(index), 'name'],
      message: `Duplicate property binding name '${bindingName}'`,
    });
  }
  return resolveBindings(
    graph,
    inputs,
    index + 1,
    [...resolved, result.value],
    new Set([...seenNames, bindingName]),
  );
}

function createDefaultViewNodes(
  shapeNode: Node,
  bindings: readonly ShapePropertyBinding[],
  options: NodeOperationOptions,
): Readonly<{ queryNode: Node; viewNode: Node }> {
  const rawName = shapeNode.properties.get('name');
  const rawNamespace = shapeNode.properties.get('namespace');
  const shapeName = typeof rawName === 'string' ? rawName : 'Shape';
  const namespace = typeof rawNamespace === 'string' ? rawNamespace : '';

  const displayProperties = bindings.map((binding) =>
    binding.kind === 'inline' ? binding.definition.name : binding.name,
  );

  const queryId = createNodeId();
  const queryDefinition = { steps: [{ kind: 'node-scan', shape: asShapeId(shapeNode.id) }] };
  const queryNode: Node = {
    id: queryId,
    shape: SYSTEM_IDS.QUERY_DEFINITION,
    properties: new Map(
      Object.entries({
        name: `${shapeName} (all)`,
        namespace,
        description: `All ${shapeName} nodes.`,
        definition: JSON.stringify(queryDefinition),
      }),
    ),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const viewNode: Node = {
    id: createNodeId(),
    shape: SYSTEM_IDS.VIEW_DEFINITION,
    properties: new Map(
      Object.entries({
        name: `${shapeName} (table)`,
        namespace,
        description: `Default table view for ${shapeName}.`,
        layout: 'table',
        queryRef: queryId,
        displayProperties,
      }),
    ),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return { queryNode, viewNode };
}

function generateDefaultView(
  graph: Graph,
  shapeNode: Node,
  bindings: readonly ShapePropertyBinding[],
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const { queryNode, viewNode } = createDefaultViewNodes(shapeNode, bindings, options);

  const queryResult = addNode(graph, queryNode, options);
  if (!queryResult.ok) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: [],
      message: queryResult.error.message,
    });
  }

  const viewResult = addNode(queryResult.value.graph, viewNode, options);
  if (!viewResult.ok) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: [],
      message: viewResult.error.message,
    });
  }

  const edge: Edge = {
    id: createEdgeId(),
    shape: SYSTEM_EDGE_SHAPES.DEFAULT_VIEW,
    source: shapeNode.id,
    target: viewNode.id,
    properties: new Map(),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };
  const edgeResult = addEdge(viewResult.value.graph, edge, options);
  if (!edgeResult.ok) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: [],
      message: edgeResult.error.message,
    });
  }

  return ok({
    graph: edgeResult.value.graph,
    events: [...queryResult.value.events, ...viewResult.value.events, ...edgeResult.value.events],
    value: edgeResult.value.graph,
  });
}

export type CreateShapeInput = Readonly<{
  name: string;
  namespace: string;
  entityKind: 'node' | 'edge';
  closed?: boolean | undefined;
  description?: string | undefined;
  schemaOrgUri?: string | undefined;
  properties: readonly ShapePropertyInput[];
  validOutgoingEdges?: readonly ShapeId[] | undefined;
  validIncomingEdges?: readonly ShapeId[] | undefined;
  sourceTypes?: readonly ShapeId[] | undefined;
  targetTypes?: readonly ShapeId[] | undefined;
  transitive?: boolean | undefined;
  inverse?: ShapeId | undefined;
}>;

function buildShapePropertiesMap(
  input: CreateShapeInput,
  bindings: readonly ShapePropertyBinding[],
  schemaOrgUri: string | undefined,
): ReadonlyMap<string, PropertyValue> {
  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    namespace: input.namespace,
    entityKind: input.entityKind,
    closed: input.closed ?? false,
    properties: JSON.stringify(bindings),
    ...(input.description !== undefined && { description: input.description }),
    ...(schemaOrgUri !== undefined && { schemaOrgUri }),
    ...(input.entityKind === 'node' &&
      input.validOutgoingEdges !== undefined && { validOutgoingEdges: input.validOutgoingEdges }),
    ...(input.entityKind === 'node' &&
      input.validIncomingEdges !== undefined && { validIncomingEdges: input.validIncomingEdges }),
    ...(input.entityKind === 'edge' &&
      input.sourceTypes !== undefined && { sourceTypes: input.sourceTypes }),
    ...(input.entityKind === 'edge' &&
      input.targetTypes !== undefined && { targetTypes: input.targetTypes }),
    ...(input.entityKind === 'edge' &&
      input.transitive !== undefined && { transitive: input.transitive }),
    ...(input.entityKind === 'edge' && input.inverse !== undefined && { inverse: input.inverse }),
  };
  return new Map(Object.entries(properties));
}

/**
Creates a new node or edge Shape definition node in `input.namespace`.
Stores durable property bindings and generates a default view when `entityKind === 'node'`.
*/
export function createShape(
  graph: Graph,
  input: CreateShapeInput,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const namespaceCheck = checkNamespaceWritable(graph, input.namespace);
  if (!namespaceCheck.ok) {
    return namespaceCheck;
  }

  if (findShapeByName(graph, input.name, input.entityKind)) {
    return error({
      code: 'SHAPE_MALFORMED',
      severity: 'error',
      path: ['name'],
      message: `Shape '${input.name}' (${input.entityKind}) already exists`,
    });
  }

  const canonicalSchemaOrgUri = (() => {
    if (input.schemaOrgUri === undefined) return ok(undefined);
    const uriResult = canonicalizeUri(input.schemaOrgUri);
    return uriResult.ok
      ? ok(uriResult.value)
      : error({
          code: 'SHAPE_MALFORMED',
          severity: 'error',
          path: ['schemaOrgUri'],
          message: uriResult.error.message,
        } satisfies ValidationError);
  })();
  if (!canonicalSchemaOrgUri.ok) {
    return canonicalSchemaOrgUri;
  }

  const bindingsResult = resolveBindings(graph, input.properties);
  if (!bindingsResult.ok) {
    return bindingsResult;
  }

  const node: Node = {
    id: createNodeId(),
    shape: SYSTEM_IDS.SHAPE,
    properties: buildShapePropertiesMap(input, bindingsResult.value, canonicalSchemaOrgUri.value),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const nodeResult = addNode(graph, node, options);
  if (!nodeResult.ok) {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: [],
      message: nodeResult.error.message,
    });
  }

  if (input.entityKind !== 'node') {
    return nodeResult;
  }

  const viewResult = generateDefaultView(
    nodeResult.value.graph,
    node,
    bindingsResult.value,
    options,
  );
  if (!viewResult.ok) {
    return viewResult;
  }

  return ok({
    graph: viewResult.value.graph,
    events: [...nodeResult.value.events, ...viewResult.value.events],
    value: viewResult.value.graph,
  });
}

export type CreatePropertyTypeInput = Readonly<{
  name: string;
  namespace: string;
  valueKind: string;
  description?: string | undefined;
  cardinality?: 'one' | 'many' | undefined;
  unique?: boolean | undefined;
  nullable?: boolean | undefined;
  choices?: readonly string[] | undefined;
  targetShapeId?: ShapeId | undefined;
  regex?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  schemaOrgUri?: string | undefined;
}>;

function buildPropertyTypePropertiesMap(
  input: CreatePropertyTypeInput,
  valueKind: PropertyValueKind,
): ReadonlyMap<string, PropertyValue> {
  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    namespace: input.namespace,
    valueKind,
    ...(input.description !== undefined && { description: input.description }),
    ...(input.cardinality !== undefined && { cardinality: input.cardinality }),
    ...(input.unique !== undefined && { unique: input.unique }),
    ...(input.nullable !== undefined && { nullable: input.nullable }),
    ...(input.choices !== undefined && { choices: JSON.stringify(input.choices) }),
    ...(input.targetShapeId !== undefined && { targetShapeId: input.targetShapeId }),
    ...(input.regex !== undefined && { regex: input.regex }),
    ...(input.min !== undefined && { min: input.min }),
    ...(input.max !== undefined && { max: input.max }),
    ...(input.schemaOrgUri !== undefined && { schemaOrgUri: input.schemaOrgUri }),
  };
  return new Map(Object.entries(properties));
}

/**
Creates a new PropertyType node in `input.namespace`, resolvable by `validatePropertyByType` and `ShapePropertyBinding`.
*/
export function createPropertyType(
  graph: Graph,
  input: CreatePropertyTypeInput,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const namespaceCheck = checkNamespaceWritable(graph, input.namespace);
  if (!namespaceCheck.ok) {
    return namespaceCheck;
  }

  const valueKindResult = PropertyValueKindSchema.safeParse(input.valueKind);
  if (!valueKindResult.success) {
    return error({
      code: 'PROPERTY_TYPE_MALFORMED',
      severity: 'error',
      path: ['valueKind'],
      message: `'${input.valueKind}' is not a valid PropertyValueKind`,
    });
  }

  if (valueKindResult.data === 'list') {
    return error({
      code: 'CONSTRAINT',
      severity: 'error',
      path: ['valueKind'],
      message:
        "Value kind 'list' is deprecated for new authoring; use 'text' with cardinality 'many'",
    });
  }

  const parsed = PropertyDefinitionSchema.safeParse({
    name: input.name,
    valueKind: valueKindResult.data,
    required: false,
    ...(input.description !== undefined && { description: input.description }),
    ...(input.cardinality !== undefined && { cardinality: input.cardinality }),
    ...(input.unique !== undefined && { unique: input.unique }),
    ...(input.nullable !== undefined && { nullable: input.nullable }),
    ...(input.choices !== undefined && { choices: input.choices }),
    ...(input.targetShapeId !== undefined && { targetShapeId: input.targetShapeId }),
    ...(input.regex !== undefined && { regex: input.regex }),
    ...(input.min !== undefined && { min: input.min }),
    ...(input.max !== undefined && { max: input.max }),
    ...(input.schemaOrgUri !== undefined && { schemaOrgUri: input.schemaOrgUri }),
  });

  if (!parsed.success) {
    return error({
      code: 'PROPERTY_TYPE_MALFORMED',
      severity: 'error',
      path: parsed.error.issues[0]?.path.map(String) ?? [],
      message: parsed.error.issues[0]?.message ?? 'Malformed PropertyType input',
    });
  }

  const constraintErrors = validatePropertyConstraints(parsed.data, 'PROPERTY_TYPE_MALFORMED');
  if (constraintErrors.length > 0 && constraintErrors[0] !== undefined) {
    const first = constraintErrors[0];
    return error({
      ...first,
      path: first.path.slice(1),
    });
  }

  const hasDuplicate = getNodesOfShape(graph, SYSTEM_IDS.PROPERTY_TYPE).some(
    (node) => node.properties.get('name') === input.name,
  );
  if (hasDuplicate) {
    return error({
      code: 'PROPERTY_TYPE_MALFORMED',
      severity: 'error',
      path: ['name'],
      message: `PropertyType '${input.name}' already exists`,
    });
  }

  const node: Node = {
    id: createNodeId(),
    shape: SYSTEM_IDS.PROPERTY_TYPE,
    properties: buildPropertyTypePropertiesMap(input, valueKindResult.data),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return fromAddNodeResult(addNode(graph, node, options));
}
