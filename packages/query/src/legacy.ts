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
      if (!prop) return false;

      if (prop.kind !== value.kind) return false;

      // Simplified check
      if ('value' in prop && 'value' in value) {
        return prop.value === value.value;
      }
      return true;
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
