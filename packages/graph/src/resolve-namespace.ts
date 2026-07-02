import type { Graph } from './graph';
import type { Node } from './node';
import type { Namespace } from './identifiers';
import type { Result } from './result';
import { ok, err } from './result';
import { SYSTEM_IDS } from './system';
import { asNamespace } from './factories';
import { NamespaceSchema } from './schemas';
import { getNodeType } from './queries';

/**
 * Validates a namespace name (format via `NamespaceSchema`, existence via a non-deleted
 * `Namespace` node lookup) and returns the branded `Namespace` on success.
 * The sole source of namespace validity — no hardcoded string-literal list.
 */
export function parseNamespace(graph: Readonly<Graph>, name: string): Result<Namespace, Error> {
  const formatResult = NamespaceSchema.safeParse(name);
  if (!formatResult.success) {
    return err(new Error(formatResult.error.issues[0]?.message ?? `Invalid namespace '${name}'`));
  }

  const exists = [...graph.nodes.values()].some(
    (node) => node.type === SYSTEM_IDS.NAMESPACE && node.properties.get('name') === name,
  );
  if (!exists) {
    return err(new Error(`Namespace '${name}' does not exist`));
  }

  return ok(formatResult.data);
}

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
  if (typeof override === 'string') {
    const parsed = parseNamespace(graph, override);
    if (parsed.ok) {
      return parsed.value;
    }
  }
  const typeDef = getNodeType(graph, node.type);
  if (typeDef) {
    const ns = typeDef.properties.get('namespace');
    if (typeof ns === 'string') {
      const parsed = parseNamespace(graph, ns);
      if (parsed.ok) {
        return parsed.value;
      }
    }
  }
  return asNamespace('user');
}
