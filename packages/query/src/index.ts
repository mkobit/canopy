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
            if (prop.kind !== value.kind) {
              match = false;
              break;
            }
            if (prop.kind === 'reference' && value.kind === 'reference') {
               if (prop.target !== value.target) {
                   match = false;
                   break;
               }
            } else if (prop.kind === 'external-reference' && value.kind === 'external-reference') {
                if (prop.target !== value.target || prop.graph !== value.graph) {
                    match = false;
                    break;
                }
            } else if (prop.kind === 'list' && value.kind === 'list') {
                // Shallow comparison for lists not implemented in this simple query engine yet
                // Skipping for now or implementing strict equality if refs match
                if (prop !== value) { // Fallback
                     match = false;
                     break;
                }
            } else if ('value' in prop && 'value' in value) {
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

  findEdges(type: string, source?: string, target?: string, properties?: Record<string, PropertyValue>): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.graph.edges.values()) {
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
                    if (prop.kind !== value.kind) {
                        match = false;
                        break;
                    }
                    if (prop.kind === 'reference' && value.kind === 'reference') {
                       if (prop.target !== value.target) {
                           match = false;
                           break;
                       }
                    } else if (prop.kind === 'external-reference' && value.kind === 'external-reference') {
                        if (prop.target !== value.target || prop.graph !== value.graph) {
                            match = false;
                            break;
                        }
                    } else if (prop.kind === 'list' && value.kind === 'list') {
                        if (prop !== value) {
                             match = false;
                             break;
                        }
                    } else if ('value' in prop && 'value' in value) {
                         if (prop.value !== value.value) {
                            match = false;
                            break;
                         }
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
    for (const edge of this.graph.edges.values()) {
        if (edge.source === nodeId) {
            edges.push(edge);
        }
    }
    return edges;
  }

  getIncomingEdges(nodeId: string): Edge[] {
    const edges: Edge[] = [];
    for (const edge of this.graph.edges.values()) {
        if (edge.target === nodeId) {
            edges.push(edge);
        }
    }
    return edges;
  }
}
