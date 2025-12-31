import { GraphStore } from '@canopy/core';
import { Node, Edge } from '@canopy/schema';

export class GraphQuery {
  private store: GraphStore;

  constructor(store: GraphStore) {
    this.store = store;
  }

  findNodes(type: string, properties?: Record<string, unknown>): Node[] {
    const nodes: Node[] = [];
    for (const node of this.store.nodes.values()) {
      if (node.type === type) {
        if (properties) {
          let match = true;
          for (const [key, value] of Object.entries(properties)) {
            if (node.properties[key] !== value) {
              match = false;
              break;
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

  findEdges(type: string, source?: string, target?: string, properties?: Record<string, unknown>): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.store.edges.values()) {
        if (edge.type === type) {
             let match = true;

             if (source && edge.source !== source) match = false;
             if (target && edge.target !== target) match = false;

             if (match && properties) {
                for (const [key, value] of Object.entries(properties)) {
                    if (edge.properties[key] !== value) {
                        match = false;
                        break;
                    }
                }
             }

             if (match) edges.push(edge);
        }
    }
    return edges;
  }

  getOutgoingEdges(nodeId: string): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.store.edges.values()) {
        if (edge.source === nodeId) {
            edges.push(edge);
        }
    }
    return edges;
  }

  getIncomingEdges(nodeId: string): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.store.edges.values()) {
        if (edge.target === nodeId) {
            edges.push(edge);
        }
    }
    return edges;
  }
}
