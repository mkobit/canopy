import type { Graph } from '../graph';
import type { Node } from '../node';
import type { NodeId } from '../identifiers';
import type { Result } from '../result';
import type { GraphResult } from '../events';
import type { ValidationError } from '../validation-types';
import type { PropertyDefinition, PropertyValue } from '../properties';
import type { NodeOperationOptions } from './node';
import { createNodeId, createInstant } from '../factories';
import { ok, err } from '../result';
import { addNode } from './node';
import { SYSTEM_IDS } from '../system';
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
    return err({ path: ['namespace'], message: `Namespace '${name}' does not exist` });
  }
  const kind = node.properties.get('kind');
  if (typeof kind === 'string' && RESTRICTED_NAMESPACE_KINDS.has(kind)) {
    return err({
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
  return err({ path: [], message: result.error.message });
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
    return err({
      path: ['name'],
      message: formatResult.error.issues[0]?.message ?? `Invalid namespace name '${input.name}'`,
    });
  }

  if (RESTRICTED_NAMESPACE_KINDS.has(input.kind)) {
    return err({
      path: ['kind'],
      message: `Namespace kind '${input.kind}' is restricted and cannot be created via this op`,
    });
  }

  if (findNamespaceNode(graph, input.name)) {
    return err({ path: ['name'], message: `Namespace '${input.name}' already exists` });
  }

  const properties: Record<string, PropertyValue> = {
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
      return err({
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

  const refNode = graph.nodes.get(input.propertyTypeId);
  if (!refNode || refNode.type !== SYSTEM_IDS.PROPERTY_TYPE) {
    return err({
      path: ['properties', String(index), 'propertyTypeId'],
      message: `PropertyType '${input.propertyTypeId}' does not exist`,
    });
  }

  const name = refNode.properties.get('name');
  const valueKindResult = PropertyValueKindSchema.safeParse(refNode.properties.get('valueKind'));
  if (typeof name !== 'string' || !valueKindResult.success) {
    return err({
      path: ['properties', String(index), 'propertyTypeId'],
      message: `PropertyType '${input.propertyTypeId}' is malformed`,
    });
  }

  const description = refNode.properties.get('description');
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
    return err({ path: ['name'], message: `NodeType '${input.name}' already exists` });
  }

  const propertiesResult = resolveProperties(graph, input.properties);
  if (!propertiesResult.ok) {
    return propertiesResult;
  }

  const properties: Record<string, PropertyValue> = {
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

  return fromAddNodeResult(addNode(graph, node, options));
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
    return err({ path: ['name'], message: `EdgeType '${input.name}' already exists` });
  }

  const propertiesResult = resolveProperties(graph, input.properties);
  if (!propertiesResult.ok) {
    return propertiesResult;
  }

  const properties: Record<string, PropertyValue> = {
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
}>;

/**
 * Creates a new PropertyType node in `input.namespace`, resolvable by `validatePropertyByType`.
 * Rejects a duplicate `name`, a restricted target namespace, or a `valueKind` outside
 * the `PropertyValueKind` union.
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
    return err({
      path: ['valueKind'],
      message: `'${input.valueKind}' is not a valid PropertyValueKind`,
    });
  }

  const hasDuplicate = getNodesOfType(graph, SYSTEM_IDS.PROPERTY_TYPE).some(
    (node) => node.properties.get('name') === input.name,
  );
  if (hasDuplicate) {
    return err({ path: ['name'], message: `PropertyType '${input.name}' already exists` });
  }

  const properties: Record<string, PropertyValue> = {
    name: input.name,
    namespace: input.namespace,
    valueKind: valueKindResult.data,
    ...(input.description !== undefined && { description: input.description }),
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
