import type * as Y from 'yjs';
import type {
  Node,
  Edge,
  Result,
} from '@canopy/types';
import * as NodeOps from './ops/node';
import * as EdgeOps from './ops/edge';

export class GraphStore {
  readonly doc: Y.Doc;
  readonly nodes: Y.Map<unknown>; // Stored as plain JSON object
  readonly edges: Y.Map<unknown>;

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.nodes = doc.getMap('nodes');
    this.edges = doc.getMap('edges');
  }

  addNode(
    data: Omit<Node, 'id' | 'metadata'> & Readonly<{
      id?: string;
    }>,
  ): Result<Node, Error> {
    return NodeOps.addNode(this.nodes, data);
  }

  getNode(id: string): Node | undefined {
    const result = NodeOps.getNode(this.nodes, id);
    return result.ok ? result.value : undefined;
  }

  getAllNodes(): IterableIterator<Node> {
     const result = NodeOps.getAllNodes(this.nodes);
     if (result.ok) {
         return result.value;
     }
     // Fallback to empty iterator if error
     return [][Symbol.iterator]();
  }

  updateNode(id: string, partial: Partial<Omit<Node, 'id' | 'metadata'>>): Result<Node, Error> {
    return NodeOps.updateNode(this.nodes, id, partial);
  }

  deleteNode(id: string): Result<void, Error> {
    return NodeOps.deleteNode(this.nodes, id);
  }

  addEdge(
    data: Omit<Edge, 'id' | 'metadata'> & Readonly<{
      id?: string;
    }>,
  ): Result<Edge, Error> {
    return EdgeOps.addEdge(this.edges, this.nodes, data);
  }

  getEdge(id: string): Edge | undefined {
      const result = EdgeOps.getEdge(this.edges, id);
      return result.ok ? result.value : undefined;
  }

  getAllEdges(): IterableIterator<Edge> {
      const result = EdgeOps.getAllEdges(this.edges);
      if (result.ok) {
          return result.value;
      }
      return [][Symbol.iterator]();
  }

  updateEdge(id: string, partial: Partial<Omit<Edge, 'id' | 'metadata'>>): Result<Edge, Error> {
      return EdgeOps.updateEdge(this.edges, this.nodes, id, partial);
  }

  deleteEdge(id: string): Result<void, Error> {
      return EdgeOps.deleteEdge(this.edges, id);
  }
}
