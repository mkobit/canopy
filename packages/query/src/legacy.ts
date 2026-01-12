import type { Graph, Node, Edge, PropertyValue } from '@canopy/types';
import { filter } from 'remeda';

export class GraphQuery {
  private readonly graph: Graph;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  findNodes(type: string, properties?: Record<string, PropertyValue>): readonly Node[] {
    return filter(
      Array.from(this.graph.nodes.values()),
      node => {
        if (node.type !== type) return false;

        if (!properties) return true;

        return Object.entries(properties).every(([key,
value]) => {
            const prop = node.properties.get(key);
            if (!prop) return false;

            if (prop.kind !== value.kind) return false;

             // Simplified check
             if ('value' in prop && 'value' in value) {
                 return prop.value === value.value;
            }
            return true;
        });
      },
    );
  }

  findEdges(_type: string, _source?: string, _target?: string, _properties?: Record<string, PropertyValue>): readonly Edge[] {
      // simplified legacy implementation
      return [];
  }
}
