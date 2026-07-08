import {
  SYSTEM_IDS,
  RESTRICTED_NAMESPACE_KINDS,
  asTypeId,
  fromThrowable,
  PropertyDefinitionSchema,
  type Graph,
  type Node,
  type PropertyDefinition,
  type TypeId,
} from '@canopy/graph';
import { z } from 'zod';
import type { NamespaceOption } from './schema';

export interface NodeTypeOption {
  readonly id: TypeId;
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

const PropertyDefinitionsSchema = z.array(PropertyDefinitionSchema);

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseProperties(raw: unknown): readonly PropertyDefinition[] {
  const text = readString(raw);
  if (text === undefined) return [];
  const parsedJson = fromThrowable(() => JSON.parse(text) as unknown);
  if (!parsedJson.ok) return [];
  const parsed = PropertyDefinitionsSchema.safeParse(parsedJson.value);
  return parsed.success ? parsed.data : [];
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
    .filter((node) => node.type === SYSTEM_IDS.NODE_TYPE && isInstantiable(node, kindByNamespace))
    .map((node) => ({
      id: asTypeId(node.id),
      label: readString(node.properties.get('name')) ?? node.id,
      description: readString(node.properties.get('description')),
      properties: parseProperties(node.properties.get('properties')),
    }));
}
