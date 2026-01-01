import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import {
  Node,
  Edge,
  NodeId,
  EdgeId,
  Instant,
  PropertyValue,
} from '@canopy/types';
import {
  NodeSchema,
  EdgeSchema,
} from '@canopy/schema';

// Helper types for storage (Plain Objects)
type StorableProperties = Record<string, PropertyValue>;

interface StorableNode extends Omit<Node, 'properties'> {
  properties: StorableProperties;
}

interface StorableEdge extends Omit<Edge, 'properties'> {
  properties: StorableProperties;
}

// Converters
const propertiesToStorable = (props: ReadonlyMap<string, PropertyValue>): StorableProperties => {
  return Object.fromEntries(props);
};

const storableToProperties = (props: StorableProperties): Map<string, PropertyValue> => {
  return new Map(Object.entries(props));
};

const nodeToStorable = (node: Node): StorableNode => {
  return {
    ...node,
    properties: propertiesToStorable(node.properties),
  };
};

const storableToNode = (storable: unknown): Node => {
    // We trust Yjs stores what we put in, but types are loose
    const n = storable as StorableNode;
    return {
        ...n,
        properties: storableToProperties(n.properties)
    };
};

const edgeToStorable = (edge: Edge): StorableEdge => {
  return {
    ...edge,
    properties: propertiesToStorable(edge.properties),
  };
};

const storableToEdge = (storable: unknown): Edge => {
    const e = storable as StorableEdge;
    return {
        ...e,
        properties: storableToProperties(e.properties)
    };
};


export class GraphStore {
  doc: Y.Doc;
  nodes: Y.Map<unknown>; // Stored as plain JSON object
  edges: Y.Map<unknown>;

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.nodes = doc.getMap('nodes');
    this.edges = doc.getMap('edges');
  }

  addNode(
    data: Omit<Node, 'id' | 'metadata'> & {
      id?: string;
    }
  ): Node {
    const now = new Date().toISOString() as Instant;
    const node: Node = {
      id: (data.id || uuidv4()) as NodeId,
      type: data.type,
      properties: data.properties,
      metadata: {
        created: now,
        modified: now,
      }
    };

    // Validate schema on the domain object
    NodeSchema.parse(node);

    this.nodes.set(node.id, nodeToStorable(node));
    return node;
  }

  getNode(id: string): Node | undefined {
    const n = this.nodes.get(id);
    return n ? storableToNode(n) : undefined;
  }

  *getAllNodes(): IterableIterator<Node> {
      for (const n of this.nodes.values()) {
          yield storableToNode(n);
      }
  }

  updateNode(id: string, partial: Partial<Omit<Node, 'id' | 'metadata'>>): Node {
    const existing = this.getNode(id);
    if (!existing) {
      throw new Error(`Node ${id} not found`);
    }

    const now = new Date().toISOString() as Instant;
    const updated: Node = {
      ...existing,
      ...partial,
      metadata: {
        ...existing.metadata,
        modified: now,
      },
    };

    // Validate schema
    NodeSchema.parse(updated);

    this.nodes.set(id, nodeToStorable(updated));
    return updated;
  }

  deleteNode(id: string): void {
    if (!this.nodes.has(id)) {
      throw new Error(`Node ${id} not found`);
    }
    this.nodes.delete(id);
  }

  addEdge(
    data: Omit<Edge, 'id' | 'metadata'> & {
      id?: string;
    }
  ): Edge {
    if (!this.nodes.has(data.source)) {
      throw new Error(`Source node ${data.source} not found`);
    }
    if (!this.nodes.has(data.target)) {
      throw new Error(`Target node ${data.target} not found`);
    }

    const now = new Date().toISOString() as Instant;
    const edge: Edge = {
      id: (data.id || uuidv4()) as EdgeId,
      source: data.source,
      target: data.target,
      type: data.type,
      properties: data.properties,
      metadata: {
        created: now,
        modified: now,
      }
    };

    // Validate schema
    EdgeSchema.parse(edge);

    this.edges.set(edge.id, edgeToStorable(edge));
    return edge;
  }

  getEdge(id: string): Edge | undefined {
    const e = this.edges.get(id);
    return e ? storableToEdge(e) : undefined;
  }

  *getAllEdges(): IterableIterator<Edge> {
      for (const e of this.edges.values()) {
          yield storableToEdge(e);
      }
  }

  updateEdge(id: string, partial: Partial<Omit<Edge, 'id' | 'metadata'>>): Edge {
      const existing = this.getEdge(id);
      if (!existing) {
          throw new Error(`Edge ${id} not found`);
      }

      const now = new Date().toISOString() as Instant;
      const updated: Edge = {
          ...existing,
          ...partial,
          metadata: {
              ...existing.metadata,
              modified: now,
          },
      };

       // Check if source and target exist if they are being updated
        if (partial.source && !this.nodes.has(partial.source)) {
            throw new Error(`Source node ${partial.source} not found`);
        }
        if (partial.target && !this.nodes.has(partial.target)) {
            throw new Error(`Target node ${partial.target} not found`);
        }

      // Validate schema
      EdgeSchema.parse(updated);

      this.edges.set(id, edgeToStorable(updated));
      return updated;
  }

  deleteEdge(id: string): void {
      if (!this.edges.has(id)) {
          throw new Error(`Edge ${id} not found`);
      }
      this.edges.delete(id);
  }
}
