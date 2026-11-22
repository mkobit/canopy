import {
  SYSTEM_IDS,
  RESTRICTED_NAMESPACE_KINDS,
  asNodeId,
  asShapeId,
  extractPropertyTypeDefinition,
  fromThrowable,
  ShapePropertyBindingSchema,
  type Graph,
  type Node,
  type PropertyDefinition,
  type ShapeId,
} from '@canopy/graph';
import { z } from 'zod';
import type { NamespaceOption } from './schema';

export interface NodeTypeOption {
  readonly id: ShapeId;
  readonly label: string;
  readonly description: string | undefined;
  readonly properties: readonly PropertyDefinition[];
}

// TextBlock/CodeBlock/MarkdownNode are bootstrap-seeded into the restricted `system`
// namespace (a pre-existing placement quirk, unrelated to this fix) but must stay
// instantiable -- unlike the rest of `system`'s machinery types.
// We also allow QueryDefinition to be instantiated so users can save/manage queries.
const LEGACY_ALLOWED_TYPE_DEF_IDS: ReadonlySet<string> = new Set([
  SYSTEM_IDS.NODE_TYPE_MARKDOWN,
  SYSTEM_IDS.NODE_TYPE_CODE_BLOCK,
  SYSTEM_IDS.NODE_TYPE_TEXT_BLOCK,
  SYSTEM_IDS.QUERY_DEFINITION_DEF,
]);

// UserSetting lives in the non-restricted `user-settings` namespace despite being
// settings-cascade machinery, not user content -- namespace restriction alone can't
// tell the two apart, so exclude it explicitly.
const EXCLUDED_TYPE_DEF_IDS: ReadonlySet<string> = new Set([SYSTEM_IDS.USER_SETTING_DEF]);

const ShapeBindingsSchema = z.array(ShapePropertyBindingSchema);

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseProperties(raw: unknown, graph?: Graph): readonly PropertyDefinition[] {
  const text = readString(raw);
  if (text === undefined) return [];
  const parsedJson = fromThrowable(() => JSON.parse(text) as unknown);
  if (!parsedJson.ok) return [];
  const parsed = ShapeBindingsSchema.safeParse(parsedJson.value);
  if (!parsed.success) return [];
  return parsed.data.map((binding): PropertyDefinition => {
    if (binding.kind === 'inline') {
      return binding.definition;
    }
    const ptNode = graph?.nodes.get(asNodeId(binding.propertyTypeId));
    const ptResult = ptNode ? extractPropertyTypeDefinition(ptNode) : undefined;
    if (ptResult?.ok) {
      return {
        ...ptResult.value,
        name: binding.name,
        required: binding.required,
        cardinality: binding.cardinality ?? ptResult.value.cardinality,
        description: binding.description ?? ptResult.value.description,
      };
    }
    return {
      name: binding.name,
      valueKind: 'text',
      required: binding.required,
      description: binding.description,
      cardinality: binding.cardinality,
    };
  });
}

function isInstantiable(node: Node, kindByNamespace: ReadonlyMap<string, string>): boolean {
  if (LEGACY_ALLOWED_TYPE_DEF_IDS.has(node.id)) return true;
  if (EXCLUDED_TYPE_DEF_IDS.has(node.id)) return false;
  const namespace = readString(node.properties.get('namespace'));
  const kind = namespace ? kindByNamespace.get(namespace) : undefined;
  return kind !== undefined && !RESTRICTED_NAMESPACE_KINDS.has(kind);
}

export function listAllowedNodeTypes(
  graph: Graph,
  namespaces: readonly NamespaceOption[],
): readonly NodeTypeOption[] {
  const kindByNamespace = new Map<string, string>(namespaces.map((ns) => [ns.name, ns.kind]));
  return [...graph.nodes.values()]
    .filter(
      (node) =>
        node.shape === SYSTEM_IDS.SHAPE &&
        node.properties.get('entityKind') === 'node' &&
        isInstantiable(node, kindByNamespace),
    )
    .map((node) => ({
      id: asShapeId(node.id),
      label: readString(node.properties.get('name')) ?? node.id,
      description: readString(node.properties.get('description')),
      properties: parseProperties(node.properties.get('properties'), graph),
    }));
}
