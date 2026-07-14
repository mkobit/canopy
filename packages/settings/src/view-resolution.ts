import type { Graph, Node, NodeId, TypeId, Namespace, Result } from '@canopy/graph';
import { SYSTEM_EDGE_TYPES, SYSTEM_IDS, getEdgesFrom, ok, err, asNodeId } from '@canopy/graph';
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
  // 1. Look for an outbound edge from nodeId of type SYSTEM_EDGE_TYPES.VIEW_OVERRIDE to a ViewDefinition node.
  const overrideEdges = getEdgesFrom(graph, nodeId, SYSTEM_EDGE_TYPES.VIEW_OVERRIDE);
  const overrideTarget = overrideEdges
    .map((edge) => graph.nodes.get(edge.target))
    .find((node): node is Node => node !== undefined && node.type === SYSTEM_IDS.VIEW_DEFINITION);
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

  // 3. Look for an outbound edge from the nodeType definition node of type SYSTEM_EDGE_TYPES.DEFAULT_VIEW to a ViewDefinition node.
  const typeNodeId = asNodeId(nodeType);
  const defaultEdges = getEdgesFrom(graph, typeNodeId, SYSTEM_EDGE_TYPES.DEFAULT_VIEW);
  const defaultTarget = defaultEdges
    .map((edge) => graph.nodes.get(edge.target))
    .find((node): node is Node => node !== undefined && node.type === SYSTEM_IDS.VIEW_DEFINITION);
  if (defaultTarget) {
    return ok(defaultTarget);
  }

  // 4. If none of these succeed, return a failed Result.
  return err(new Error(`Could not resolve view definition for node: ${nodeId}`));
}
