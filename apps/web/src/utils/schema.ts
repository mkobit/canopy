import {
  SYSTEM_IDS,
  RESTRICTED_NAMESPACE_KINDS,
  getNodesOfType,
  PropertyValueKindSchema,
  asNamespace,
  type Graph,
  type Node,
  type NodeId,
  type Namespace,
  type PropertyDefinition,
  type PropertyValueKind,
} from '@canopy/graph';
import { readString, parseProperties } from './node-types';

export interface NamespaceOption {
  readonly id: NodeId;
  readonly name: Namespace;
  readonly kind: string;
  readonly description: string | undefined;
}

export interface TypeDefOption {
  readonly id: NodeId;
  readonly name: string;
  readonly namespace: string;
  readonly description: string | undefined;
  readonly properties: readonly PropertyDefinition[];
}

export interface EdgeTypeOption extends TypeDefOption {
  readonly sourceTypes: readonly string[];
  readonly targetTypes: readonly string[];
}

export interface PropertyTypeOption {
  readonly id: NodeId;
  readonly name: string;
  readonly namespace: string;
  readonly valueKind: PropertyValueKind;
  readonly description: string | undefined;
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toNamespaceOption(node: Node): NamespaceOption | undefined {
  const name = readString(node.properties.get('name'));
  const kind = readString(node.properties.get('kind'));
  if (name === undefined || kind === undefined) return undefined;
  return {
    id: node.id,
    name: asNamespace(name),
    kind,
    description: readString(node.properties.get('description')),
  };
}

function toTypeDefOption(node: Node): TypeDefOption | undefined {
  const name = readString(node.properties.get('name'));
  const namespace = readString(node.properties.get('namespace'));
  if (name === undefined || namespace === undefined) return undefined;
  return {
    id: node.id,
    name,
    namespace,
    description: readString(node.properties.get('description')),
    properties: parseProperties(node.properties.get('properties')),
  };
}

function toEdgeTypeOption(node: Node): EdgeTypeOption | undefined {
  const base = toTypeDefOption(node);
  if (!base) return undefined;
  return {
    ...base,
    sourceTypes: readStringArray(node.properties.get('sourceTypes')),
    targetTypes: readStringArray(node.properties.get('targetTypes')),
  };
}

function toPropertyTypeOption(node: Node): PropertyTypeOption | undefined {
  const name = readString(node.properties.get('name'));
  const namespace = readString(node.properties.get('namespace'));
  const valueKindResult = PropertyValueKindSchema.safeParse(node.properties.get('valueKind'));
  if (name === undefined || namespace === undefined || !valueKindResult.success) return undefined;
  return {
    id: node.id,
    name,
    namespace,
    valueKind: valueKindResult.data,
    description: readString(node.properties.get('description')),
  };
}

export function listNamespaces(graph: Graph): readonly NamespaceOption[] {
  return getNodesOfType(graph, SYSTEM_IDS.NAMESPACE)
    .map(toNamespaceOption)
    .filter((option): option is NamespaceOption => option !== undefined);
}

/** Non-restricted `kind` values in use, for populating the namespace-create kind picker. */
export function listCreatableNamespaceKinds(
  namespaces: readonly NamespaceOption[],
): readonly string[] {
  const kinds = new Set(namespaces.map((ns) => ns.kind));
  return [...kinds].filter((kind) => !RESTRICTED_NAMESPACE_KINDS.has(kind)).toSorted();
}

export function listAllNodeTypes(graph: Graph): readonly TypeDefOption[] {
  return getNodesOfType(graph, SYSTEM_IDS.NODE_TYPE)
    .map(toTypeDefOption)
    .filter((option): option is TypeDefOption => option !== undefined);
}

export function listNodeTypesIn(graph: Graph, namespace: string): readonly TypeDefOption[] {
  return listAllNodeTypes(graph).filter((option) => option.namespace === namespace);
}

export function listEdgeTypesIn(graph: Graph, namespace: string): readonly EdgeTypeOption[] {
  return getNodesOfType(graph, SYSTEM_IDS.EDGE_TYPE)
    .map(toEdgeTypeOption)
    .filter((option): option is EdgeTypeOption => option !== undefined)
    .filter((option) => option.namespace === namespace);
}

export function listPropertyTypesIn(
  graph: Graph,
  namespace: string,
): readonly PropertyTypeOption[] {
  return listAllPropertyTypes(graph).filter((option) => option.namespace === namespace);
}

/** All PropertyType nodes across every namespace, for the reference-existing-PropertyType picker. */
export function listAllPropertyTypes(graph: Graph): readonly PropertyTypeOption[] {
  return getNodesOfType(graph, SYSTEM_IDS.PROPERTY_TYPE)
    .map(toPropertyTypeOption)
    .filter((option): option is PropertyTypeOption => option !== undefined);
}
