import type { Graph, Node, PropertyValue, PropertyMap, PropertyChanges } from '@canopy/types';

/**
 * Iterates over graph nodes and finds the first node matching the predicate.
 * This avoids creating intermediate arrays of all nodes.
 */
export function findNode(graph: Graph, predicate: (node: Node) => boolean): Node | undefined {
  // eslint-disable-next-line functional/no-loop-statements
  for (const node of graph.nodes.values()) {
    if (predicate(node)) {
      return node;
    }
  }
  return undefined;
}

export function arePropertyValuesEqual(a: PropertyValue, b: PropertyValue): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return false;
}

export function calculatePropertyChanges(
  oldProps: PropertyMap,
  newProps: PropertyMap,
): PropertyChanges {
  // eslint-disable-next-line functional/immutable-data
  const set = new Map<string, { oldValue: PropertyValue | undefined; newValue: PropertyValue }>();
  // eslint-disable-next-line functional/immutable-data
  const removed = new Map<string, { oldValue: PropertyValue }>();

  // Check for updates and additions
  // eslint-disable-next-line functional/no-loop-statements
  for (const [key, newValue] of newProps) {
    const oldValue = oldProps.get(key);
    if (oldValue === undefined) {
      // eslint-disable-next-line functional/immutable-data
      set.set(key, { oldValue: undefined, newValue });
    } else if (!arePropertyValuesEqual(oldValue, newValue)) {
      // eslint-disable-next-line functional/immutable-data
      set.set(key, { oldValue, newValue });
    }
  }

  // Check for removals
  // eslint-disable-next-line functional/no-loop-statements
  for (const [key, oldValue] of oldProps) {
    if (!newProps.has(key)) {
      // eslint-disable-next-line functional/immutable-data
      removed.set(key, { oldValue });
    }
  }

  return { set, removed };
}
