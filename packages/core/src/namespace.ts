import type { Graph, Node, Namespace } from '@canopy/types';
import { getNodeType } from './queries';

/**
 * Returns all nodes whose effective namespace matches the given namespace.
 */
export function getNodesInNamespace(graph: Readonly<Graph>, namespace: Namespace): readonly Node[] {
  return [...graph.nodes.values()].filter((node) => resolveNamespace(graph, node) === namespace);
}

/**
 * Resolves the effective namespace for a node.
 * Resolution order: node property override > type definition namespace > 'user' default.
 */
export function resolveNamespace(graph: Readonly<Graph>, node: Node): Namespace {
  const override = node.properties.get('namespace');
  if (
    override === 'system' ||
    override === 'user' ||
    override === 'imported' ||
    override === 'user-settings'
  ) {
    return override as Namespace;
  }
  const typeDef = getNodeType(graph, node.type);
  if (typeDef) {
    const ns = typeDef.properties.get('namespace');
    if (ns === 'system' || ns === 'user' || ns === 'imported' || ns === 'user-settings') {
      return ns as Namespace;
    }
  }
  return 'user';
}
