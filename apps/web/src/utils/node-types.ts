import {
  SYSTEM_IDS,
  asTypeId,
  fromThrowable,
  PropertyDefinitionSchema,
  type Graph,
  type PropertyDefinition,
  type TypeId,
} from '@canopy/graph';
import { z } from 'zod';

export interface NodeTypeOption {
  readonly id: TypeId;
  readonly label: string;
  readonly description: string | undefined;
  readonly properties: readonly PropertyDefinition[];
}

const ALLOWED_TYPE_DEF_IDS: ReadonlySet<string> = new Set([
  SYSTEM_IDS.NODE_TYPE_MARKDOWN,
  SYSTEM_IDS.NODE_TYPE_CODE_BLOCK,
]);

const PropertyDefinitionsSchema = z.array(PropertyDefinitionSchema);

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseProperties(raw: unknown): readonly PropertyDefinition[] {
  const text = readString(raw);
  if (text === undefined) return [];
  const parsedJson = fromThrowable(() => JSON.parse(text) as unknown);
  if (!parsedJson.ok) return [];
  const parsed = PropertyDefinitionsSchema.safeParse(parsedJson.value);
  return parsed.success ? parsed.data : [];
}

export function listAllowedNodeTypes(graph: Graph): readonly NodeTypeOption[] {
  return [...graph.nodes.values()]
    .filter((node) => node.type === SYSTEM_IDS.NODE_TYPE && ALLOWED_TYPE_DEF_IDS.has(node.id))
    .map((node) => ({
      id: asTypeId(node.id),
      label: readString(node.properties.get('name')) ?? node.id,
      description: readString(node.properties.get('description')),
      properties: parseProperties(node.properties.get('properties')),
    }));
}
