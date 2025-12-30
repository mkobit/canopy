import { Node, Edge } from '@canopy/schema';
import * as Y from 'yjs';

export class GraphEngine {
  private doc: Y.Doc;
  private nodes: Y.Map<Node>;
  private edges: Y.Map<Edge>;

  constructor() {
    this.doc = new Y.Doc();
    this.nodes = this.doc.getMap('nodes');
    this.edges = this.doc.getMap('edges');
  }

  addNode(node: Node) {
    this.nodes.set(node.id, node);
  }

  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }
}
