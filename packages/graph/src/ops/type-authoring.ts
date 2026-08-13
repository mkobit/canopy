import type { Graph } from '../graph';
import type { Node } from '../node';
import type { Edge } from '../edge';
import type { NodeId } from '../identifiers';
import type { Result } from '../result';
import type { GraphResult } from '../events';
import type { ValidationError } from '../validation-types';
import type { PropertyDefinition, PropertyValue } from '../properties';
import type { NodeOperationOptions } from './node';
import { createNodeId, createEdgeId, createInstant } from '../factories';
import { ok, err as error, fromThrowable } from '../result';
import { addNode } from './node';
import { addEdge } from './edge';
import { SYSTEM_IDS, SYSTEM_EDGE_TYPES } from '../system';
import { RESTRICTED_NAMESPACE_KINDS } from '../namespace';
import { getNodeType, getEdgeType, getNodesOfType } from '../queries';
import { NamespaceSchema, PropertyValueKindSchema } from '../schemas';

function findNamespaceNode(graph: Graph, name: string): Node | undefined {
  return getNodesOfType(graph, SYSTEM_IDS.NAMESPACE).find(
    (node) => node.properties.get('name') === name,
  );
}

/**
 * Confirms `name` resolves to an existing, non-restricted Namespace node -- the
 * check `createNodeType`/`createEdgeType`/`createPropertyType` run against the
 * *target* namespace they're writing into. Distinct from `createNamespace`'s own
 * kind check, which is against the namespace being created.
 */
function checkNamespaceWritable(graph: Graph, name: string): Result<undefined, ValidationError> {
  const node = findNamespaceNode(graph, name);
  if (!node) {
    return error({ path: ['namespace'], message: `Namespace '${name}' does not exist` });
  }
  const kind = node.properties.get('kind');
  if (typeof kind === 'string' && RESTRICTED_NAMESPACE_KINDS.has(kind)) {
    return error({
      path: ['namespace'],
      message: `Namespace '${name}' is restricted (kind '${kind}') and cannot be written into`,
    });
  }
  return ok(undefined);
}

function fromAddNodeResult(
  result: Result<GraphResult<Graph>, Error>,
): Result<GraphResult<Graph>, ValidationError> {
  if (result.ok) {
    return result;
  }
  return error({ path: [], message: result.error.message });
}

export type CreateNamespaceInput = Readonly<{
  name: string;
  kind: string;
  description?: string;
}>;

/**
 * Creates a new Namespace node.
 * Rejects a duplicate `name` or a restricted `kind` (see `RESTRICTED_NAMESPACE_KINDS`).
 */
export function createNamespace(
  graph: Graph,
  input: CreateNamespaceInput,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const formatResult = NamespaceSchema.safeParse(input.name);
  if (!formatResult.success) {
    return error({
      path: ['name'],
      message: formatResult.error.issues[0]?.message ?? `Invalid namespace name '${input.name}'`,
    });
  }

  if (RESTRICTED_NAMESPACE_KINDS.has(input.kind)) {
    return error({
      path: ['kind'],
      message: `Namespace kind '${input.kind}' is restricted and cannot be created via this op`,
    });
  }

  if (findNamespaceNode(graph, input.name)) {
    return error({ path: ['name'], message: `Namespace '${input.name}' already exists` });
  }

  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    kind: input.kind,
    ...(input.description !== undefined && { description: input.description }),
  };

  const node: Node = {
    id: createNodeId(),
    type: SYSTEM_IDS.NAMESPACE,
    properties: new Map(Object.entries(properties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return fromAddNodeResult(addNode(graph, node, options));
}

/**
 * A property on a new NodeType/EdgeType: either an inline definition, or a
 * reference to an existing PropertyType node (resolved into an inline
 * definition at creation time -- storage format doesn't change).
 */
export type TypePropertyInput =
  | Readonly<{
      kind: 'inline';
      name: string;
      valueKind: string;
      required: boolean;
      description?: string;
    }>
  | Readonly<{
      kind: 'reference';
      propertyTypeId: NodeId;
      required: boolean;
    }>;

function resolvePropertyInput(
  graph: Graph,
  input: TypePropertyInput,
  index: number,
): Result<PropertyDefinition, ValidationError> {
  if (input.kind === 'inline') {
    const valueKindResult = PropertyValueKindSchema.safeParse(input.valueKind);
    if (!valueKindResult.success) {
      return error({
        path: ['properties', String(index), 'valueKind'],
        message: `'${input.valueKind}' is not a valid PropertyValueKind`,
      });
    }
    return ok({
      name: input.name,
      valueKind: valueKindResult.data,
      required: input.required,
      description: input.description,
    });
  }

  const referenceNode = graph.nodes.get(input.propertyTypeId);
  if (!referenceNode || referenceNode.type !== SYSTEM_IDS.PROPERTY_TYPE) {
    return error({
      path: ['properties', String(index), 'propertyTypeId'],
      message: `PropertyType '${input.propertyTypeId}' does not exist`,
    });
  }

  const name = referenceNode.properties.get('name');
  const valueKindResult = PropertyValueKindSchema.safeParse(
    referenceNode.properties.get('valueKind'),
  );
  if (typeof name !== 'string' || !valueKindResult.success) {
    return error({
      path: ['properties', String(index), 'propertyTypeId'],
      message: `PropertyType '${input.propertyTypeId}' is malformed`,
    });
  }

  const description = referenceNode.properties.get('description');
  return ok({
    name,
    valueKind: valueKindResult.data,
    required: input.required,
    description: typeof description === 'string' ? description : undefined,
  });
}

function resolveProperties(
  graph: Graph,
  inputs: readonly TypePropertyInput[],
  index = 0,
  resolved: readonly PropertyDefinition[] = [],
): Result<readonly PropertyDefinition[], ValidationError> {
  const input = inputs[index];
  if (input === undefined) {
    return ok(resolved);
  }
  const result = resolvePropertyInput(graph, input, index);
  if (!result.ok) {
    return result;
  }
  return resolveProperties(graph, inputs, index + 1, [...resolved, result.value]);
}

/**
 * Generates the default table-view artifacts for a just-created NodeType: a
 * QueryDefinition that scans nodes of that type, a table ViewDefinition with one
 * column per declared property, and a `default_view` edge linking the NodeType to
 * the view (which populates `indexes.defaultViews`, read by `resolveViewDefinition`).
 *
 * Starts from a graph that already contains `nodeTypeNode`. All-or-nothing: any
 * sub-step failure returns an error and emits no events. The generated definitions
 * inhabit the NodeType's own (already-proven non-restricted) namespace.
 */
function generateDefaultView(
  graph: Graph,
  nodeTypeNode: Node,
  properties: readonly PropertyDefinition[],
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const rawName = nodeTypeNode.properties.get('name');
  const rawNamespace = nodeTypeNode.properties.get('namespace');
  const typeName = typeof rawName === 'string' ? rawName : 'Type';
  const namespace = typeof rawNamespace === 'string' ? rawNamespace : '';

  const queryId = createNodeId();
  const queryDefinition = { steps: [{ kind: 'node-scan', type: nodeTypeNode.id }] };
  const queryProperties: Readonly<Record<string, PropertyValue>> = {
    name: `${typeName} (all)`,
    namespace,
    description: `All ${typeName} nodes.`,
    definition: JSON.stringify(queryDefinition),
  };
  const queryNode: Node = {
    id: queryId,
    type: SYSTEM_IDS.QUERY_DEFINITION,
    properties: new Map(Object.entries(queryProperties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const viewProperties: Readonly<Record<string, PropertyValue>> = {
    name: `${typeName} (table)`,
    namespace,
    description: `Default table view for ${typeName}.`,
    layout: 'table',
    queryRef: queryId,
    displayProperties: properties.map((property) => property.name),
  };
  const viewNode: Node = {
    id: createNodeId(),
    type: SYSTEM_IDS.VIEW_DEFINITION,
    properties: new Map(Object.entries(viewProperties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  const queryResult = addNode(graph, queryNode, options);
  if (!queryResult.ok) {
    return error({ path: [], message: queryResult.error.message });
  }

  const viewResult = addNode(queryResult.value.graph, viewNode, options);
  if (!viewResult.ok) {
    return error({ path: [], message: viewResult.error.message });
  }

  const edge: Edge = {
    id: createEdgeId(),
    type: SYSTEM_EDGE_TYPES.DEFAULT_VIEW,
    source: nodeTypeNode.id,
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
    return error({ path: [], message: edgeResult.error.message });
  }

  return ok({
    graph: edgeResult.value.graph,
    events: [...queryResult.value.events, ...viewResult.value.events, ...edgeResult.value.events],
    value: edgeResult.value.graph,
  });
}

export type CreateNodeTypeInput = Readonly<{
  name: string;
  namespace: string;
  description?: string;
  properties: readonly TypePropertyInput[];
}>;

/**
 * Creates a new NodeType definition node in `input.namespace`.
 * Rejects a duplicate `name`, a restricted target namespace, or a malformed property list.
 */
export function createNodeType(
  graph: Graph,
  input: CreateNodeTypeInput,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const namespaceCheck = checkNamespaceWritable(graph, input.namespace);
  if (!namespaceCheck.ok) {
    return namespaceCheck;
  }

  if (getNodeType(graph, input.name)) {
    return error({ path: ['name'], message: `NodeType '${input.name}' already exists` });
  }

  const propertiesResult = resolveProperties(graph, input.properties);
  if (!propertiesResult.ok) {
    return propertiesResult;
  }

  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    namespace: input.namespace,
    properties: JSON.stringify(propertiesResult.value),
    ...(input.description !== undefined && { description: input.description }),
  };

  const node: Node = {
    id: createNodeId(),
    type: SYSTEM_IDS.NODE_TYPE,
    properties: new Map(Object.entries(properties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  // Create the NodeType first so its NodeCreated event stays first in `events`
  // (callers that take the first NodeCreated -- e.g. web `commitCreatedNode` --
  // keep resolving the NodeType's id), then generate its default view.
  const nodeResult = addNode(graph, node, options);
  if (!nodeResult.ok) {
    return error({ path: [], message: nodeResult.error.message });
  }

  const viewResult = generateDefaultView(
    nodeResult.value.graph,
    node,
    propertiesResult.value,
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

export type CreateEdgeTypeInput = Readonly<{
  name: string;
  namespace: string;
  description?: string;
  properties: readonly TypePropertyInput[];
  sourceTypes?: readonly string[];
  targetTypes?: readonly string[];
}>;

/**
 * Creates a new EdgeType definition node in `input.namespace`.
 * `sourceTypes`/`targetTypes` are stored as best-effort compatibility metadata only
 * (see `isEdgeCompatible`) -- they are never hard-enforced.
 */
export function createEdgeType(
  graph: Graph,
  input: CreateEdgeTypeInput,
  options: NodeOperationOptions,
): Result<GraphResult<Graph>, ValidationError> {
  const namespaceCheck = checkNamespaceWritable(graph, input.namespace);
  if (!namespaceCheck.ok) {
    return namespaceCheck;
  }

  if (getEdgeType(graph, input.name)) {
    return error({ path: ['name'], message: `EdgeType '${input.name}' already exists` });
  }

  const propertiesResult = resolveProperties(graph, input.properties);
  if (!propertiesResult.ok) {
    return propertiesResult;
  }

  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    namespace: input.namespace,
    properties: JSON.stringify(propertiesResult.value),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.sourceTypes !== undefined && { sourceTypes: input.sourceTypes }),
    ...(input.targetTypes !== undefined && { targetTypes: input.targetTypes }),
  };

  const node: Node = {
    id: createNodeId(),
    type: SYSTEM_IDS.EDGE_TYPE,
    properties: new Map(Object.entries(properties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return fromAddNodeResult(addNode(graph, node, options));
}

export type CreatePropertyTypeInput = Readonly<{
  name: string;
  namespace: string;
  valueKind: string;
  description?: string;
  cardinality?: 'one' | 'many';
  choices?: readonly string[];
  targetTypeId?: string;
  regex?: string;
  min?: number;
  max?: number;
}>;

/**
 * Creates a new PropertyType node in `input.namespace`, resolvable by `validatePropertyByType`.
 * Rejects a duplicate `name`, a restricted target namespace, or a `valueKind` outside
 * the `PropertyValueKind` union. Accepts optional constraint options (cardinality, choices, targetTypeId, regex, min, max).
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
      path: ['valueKind'],
      message: `'${input.valueKind}' is not a valid PropertyValueKind`,
    });
  }

  if (input.regex !== undefined) {
    const regexPattern = input.regex;
    const rxCheck = fromThrowable(() => new RegExp(regexPattern));
    if (!rxCheck.ok) {
      return error({
        path: ['regex'],
        message: `Invalid regular expression pattern '${input.regex}'`,
      });
    }
  }

  const hasDuplicate = getNodesOfType(graph, SYSTEM_IDS.PROPERTY_TYPE).some(
    (node) => node.properties.get('name') === input.name,
  );
  if (hasDuplicate) {
    return error({ path: ['name'], message: `PropertyType '${input.name}' already exists` });
  }

  const properties: Readonly<Record<string, PropertyValue>> = {
    name: input.name,
    namespace: input.namespace,
    valueKind: valueKindResult.data,
    ...(input.description !== undefined && { description: input.description }),
    ...(input.cardinality !== undefined && { cardinality: input.cardinality }),
    ...(input.choices !== undefined && { choices: JSON.stringify(input.choices) }),
    ...(input.targetTypeId !== undefined && { targetTypeId: input.targetTypeId }),
    ...(input.regex !== undefined && { regex: input.regex }),
    ...(input.min !== undefined && { min: input.min }),
    ...(input.max !== undefined && { max: input.max }),
  };

  const node: Node = {
    id: createNodeId(),
    type: SYSTEM_IDS.PROPERTY_TYPE,
    properties: new Map(Object.entries(properties)),
    metadata: {
      created: createInstant(),
      modified: createInstant(),
      modifiedBy: options.deviceId,
    },
  };

  return fromAddNodeResult(addNode(graph, node, options));
}
