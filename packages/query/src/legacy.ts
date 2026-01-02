import { Graph, Node, Edge, PropertyValue } from '@canopy/types';

export class GraphQuery {
  private graph: Graph;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  findNodes(type: string, properties?: Record<string, PropertyValue>): Node[] {
    const nodes: Node[] = [];
    for (const node of this.graph.nodes.values()) {
      if (node.type === type) {
        if (properties) {
          let match = true;
          for (const [key, value] of Object.entries(properties)) {
            const prop = node.properties.get(key);
            if (!prop) {
                match = false;
                break;
            }
            if (prop.kind !== value.kind) {
              match = false;
              break;
            }
             // Simplified check
             if ('value' in prop && 'value' in value) {
                 if (prop.value !== value.value) {
                    match = false;
                    break;
                 }
            }
          }
          if (match) nodes.push(node);
        } else {
          nodes.push(node);
        }
      }
    }
    return nodes;
  }

  findEdges(_type: string, _source?: string, _target?: string, _properties?: Record<string, PropertyValue>): Edge[] {
      // simplified legacy implementation
      return [];
  }
}
