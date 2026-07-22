import type { Graph, Node, NodeId, TypeId, PropertyValue, Namespace } from '@canopy/graph';
import { fromThrowable, getGraphIndexes } from '@canopy/graph';

export type ScopeType = 'node' | 'type' | 'namespace' | 'global';

/**
 * Resolves a setting value for a given node using the 5-level cascade.
 * Returns the resolved value or undefined if no setting is found and there is no default.
 */
export function resolveSetting(
  graph: Graph,
  settingKey: string,
  nodeId: NodeId,
  nodeType: TypeId,
  nodeNamespace: Namespace,
): PropertyValue | undefined {
  // 1. Find the SettingsSchema for this key
  const schema = findSettingsSchema(graph, settingKey);
  if (!schema) return undefined;

  // 2. Check each scope level in order
  const scopes: readonly Readonly<{ scopeType: ScopeType; scopeTarget?: string }>[] = [
    { scopeType: 'node', scopeTarget: nodeId },
    { scopeType: 'type', scopeTarget: nodeType },
    { scopeType: 'namespace', scopeTarget: nodeNamespace },
    { scopeType: 'global' },
  ];

  // eslint-disable-next-line functional/no-loop-statements
  for (const scope of scopes) {
    const setting = findUserSetting(graph, schema.id, scope.scopeType, scope.scopeTarget);
    if (setting !== undefined) {
      return setting;
    }
  }

  // 5. System default from SettingsSchema
  const defaultValueRaw = schema.properties.get('defaultValue');
  if (typeof defaultValueRaw === 'string' && defaultValueRaw !== 'null') {
    // defaultValue is JSON-encoded
    const result = fromThrowable(() => JSON.parse(defaultValueRaw) as PropertyValue);
    if (result.ok) {
      return result.value;
    }
    return undefined;
  }

  return undefined;
}

/**
 * Finds a SettingsSchema node by its key property.
 */
export function findSettingsSchema(graph: Graph, key: string): Node | undefined {
  const indexes = getGraphIndexes(graph);
  return indexes.settingsSchemas.get(key);
}

/**
 * Finds a UserSetting node matching the given schema, scope type, and target.
 * Returns the parsed value, or undefined if not found.
 */
function findUserSetting(
  graph: Graph,
  schemaNodeId: NodeId,
  scopeType: ScopeType,
  scopeTarget?: string,
): PropertyValue | undefined {
  const indexes = getGraphIndexes(graph);
  const key = `${schemaNodeId}\0${scopeType}\0${scopeTarget ?? ''}`;
  return indexes.userSettings.get(key);
}
