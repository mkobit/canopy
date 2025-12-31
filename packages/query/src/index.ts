import { GraphStore } from '@canopy/core';
import { Node, Edge, PropertyValue } from '@canopy/types';

export class GraphQuery {
  private store: GraphStore;

  constructor(store: GraphStore) {
    this.store = store;
  }

  findNodes(type: string, properties?: Record<string, PropertyValue>): Node[] {
    const nodes: Node[] = [];
    for (const node of this.store.getAllNodes()) {
      if (node.type === type) {
        if (properties) {
          let match = true;
          // Note: node.properties is a ReadonlyMap
          for (const [key, value] of Object.entries(properties)) {
            // Need to implement deep equality for PropertyValue if it's an object/array
            // For now assuming simple equality check for primitives or reference
            const prop = node.properties.get(key);
            if (!prop) {
                match = false;
                break;
            }
             // Simple value check - this needs to be robust for PropertyValue union
            if (prop.kind !== value.kind || prop.value !== value.value) {
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

  findEdges(type: string, source?: string, target?: string, properties?: Record<string, PropertyValue>): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.store.getAllEdges()) {
        if (edge.type === type) {
             let match = true;

             if (source && edge.source !== source) match = false;
             if (target && edge.target !== target) match = false;

             if (match && properties) {
                for (const [key, value] of Object.entries(properties)) {
                    const prop = edge.properties.get(key);
                     if (!prop) {
                        match = false;
                        break;
                    }
                    if (prop.kind !== value.kind || prop.value !== value.value) {
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
    for (const edge of this.store.getAllEdges()) {
        if (edge.source === nodeId) {
            edges.push(edge);
        }
    }
    return edges;
  }

  getIncomingEdges(nodeId: string): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.store.getAllEdges()) {
        if (edge.target === nodeId) {
            edges.push(edge);
        }
    }
    return edges;
  }
}
