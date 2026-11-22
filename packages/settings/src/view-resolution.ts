import type { Graph, Node, NodeId, ShapeId, Namespace, Result } from '@canopy/graph';
import { SYSTEM_IDS, ok, err, asNodeId, getGraphIndexes } from '@canopy/graph';
import { resolveSetting } from './cascade';

/**
Resolves the ViewDefinition node for a given node using the 3-step resolution.
*/
export function resolveViewDefinition(
  graph: Graph,
  nodeId: NodeId,
  nodeType: ShapeId | undefined,
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
    if (settingNode && settingNode.shape === SYSTEM_IDS.VIEW_DEFINITION) {
      return ok(settingNode);
    }
  }

  // 3. Look for a default view in the pre-indexed default views.
  const defaultTarget = nodeType === undefined ? undefined : indexes.defaultViews.get(nodeType);
  return defaultTarget
    ? ok(defaultTarget)
    : // 4. If none of these succeed, return a failed Result.
      err(new Error(`Could not resolve view definition for node: ${nodeId}`));
}
