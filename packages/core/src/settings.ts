import type { Graph, Node, NodeId, TypeId, PropertyValue } from '@canopy/types';
import type { Namespace } from '@canopy/types';
import { SYSTEM_IDS } from './system';

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
  const scopes: { scopeType: ScopeType; scopeTarget?: string }[] = [
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
    // eslint-disable-next-line functional/no-try-statements
    try {
      return JSON.parse(defaultValueRaw) as PropertyValue;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Finds a SettingsSchema node by its key property.
 */
export function findSettingsSchema(graph: Graph, key: string): Node | undefined {
  // eslint-disable-next-line functional/no-loop-statements
  for (const node of graph.nodes.values()) {
    if (node.type === SYSTEM_IDS.SETTINGS_SCHEMA && node.properties.get('key') === key) {
      return node;
    }
  }
  return undefined;
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
  // eslint-disable-next-line functional/no-loop-statements
  for (const node of graph.nodes.values()) {
    if (node.type !== SYSTEM_IDS.USER_SETTING) continue;
    if (node.properties.get('schemaId') !== schemaNodeId) continue;
    if (node.properties.get('scopeType') !== scopeType) continue;
    if (scopeTarget !== undefined && node.properties.get('scopeTarget') !== scopeTarget) continue;
    if (scopeTarget === undefined && node.properties.has('scopeTarget')) continue;

    const raw = node.properties.get('value');
    if (typeof raw === 'string') {
      // eslint-disable-next-line functional/no-try-statements
      try {
        return JSON.parse(raw) as PropertyValue;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
