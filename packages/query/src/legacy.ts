import type { Graph, Node, Edge, PropertyValue } from '@canopy/types';
import { filter } from 'remeda';

export function findNodes(
  graph: Graph,
  type: string,
  properties?: Record<string, PropertyValue>,
): readonly Node[] {
  return filter([...graph.nodes.values()], (node) => {
    if (node.type !== type) return false;

    if (!properties) return true;

    return Object.entries(properties).every(([key, value]) => {
      const prop = node.properties.get(key);
      if (prop === undefined) return false;

      // Deep equality check needed for arrays/objects?
      // For now assume simple comparison for primitives
      if (prop === value) return true;

      // If array?
      if (Array.isArray(prop) && Array.isArray(value)) {
        if (prop.length !== value.length) return false;
        return prop.every((v, i) => v === value[i]);
      }

      return false;
    });
  });
}

export function findEdges(
  _graph: Graph,
  _type: string,
  _source?: string,
  _target?: string,
  _properties?: Record<string, PropertyValue>,
): readonly Edge[] {
  // simplified legacy implementation
  return [];
}
