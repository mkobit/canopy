import type { Graph, Node, Edge, PropertyValue } from '@canopy/graph';
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
      const property = node.properties.get(key);
      if (property === undefined) return false;

      // Deep equality check needed for arrays/objects?
      // For now assume simple comparison for primitives
      if (property === value) return true;

      // If array?
      if (Array.isArray(property) && Array.isArray(value)) {
        if (property.length !== value.length) return false;
        return property.every((v, index) => v === value[index]);
      }

      // If object (ExternalReferenceValue)?
      if (
        typeof property === 'object' &&
        property !== null &&
        typeof value === 'object' &&
        value !== null &&
        'graph' in property &&
        'graph' in value
      ) {
        return property.graph === value.graph && property.target === value.target;
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
