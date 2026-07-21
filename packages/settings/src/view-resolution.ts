import type { Graph, Node, NodeId, TypeId, Namespace, Result } from '@canopy/graph';
import { SYSTEM_IDS, ok, err, asNodeId, getGraphIndexes } from '@canopy/graph';
import { resolveSetting } from './cascade';

/**
 * Resolves the ViewDefinition node for a given node using the 3-step resolution.
 */
export function resolveViewDefinition(
  graph: Graph,
  nodeId: NodeId,
  nodeType: TypeId,
  nodeNamespace: Namespace,
): Result<Node, Error> {
  const indexes = getGraphIndexes(graph);

  // 1. Look for an override in the pre-indexed view overrides.
  const overrideTarget = indexes.viewOverrides.get(nodeId);
  if (overrideTarget) {
    return ok(overrideTarget);
  }

  // 2. Query the settings cascade using resolveSetting(graph, 'default-view', nodeId, nodeType, nodeNamespace).
  const resolvedSetting = resolveSetting(graph, 'default-view', nodeId, nodeType, nodeNamespace);
  if (typeof resolvedSetting === 'string') {
    const targetId = asNodeId(resolvedSetting);
    const settingNode = graph.nodes.get(targetId);
    if (settingNode && settingNode.type === SYSTEM_IDS.VIEW_DEFINITION) {
      return ok(settingNode);
    }
  }

  // 3. Look for a default view in the pre-indexed default views.
  const defaultTarget = indexes.defaultViews.get(nodeType);
  if (defaultTarget) {
    return ok(defaultTarget);
  }

  // 4. If none of these succeed, return a failed Result.
  return err(new Error(`Could not resolve view definition for node: ${nodeId}`));
}
