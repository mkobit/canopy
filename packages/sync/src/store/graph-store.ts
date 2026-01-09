import * as Y from 'yjs';
import { z } from 'zod';
import {
  Node,
  Edge,
  NodeId,
  EdgeId,
  PropertyValue,
  createNodeId,
  createEdgeId,
  createInstant,
  asNodeId,
  asEdgeId,
  asTypeId
} from '@canopy/types';
import {
  NodeSchema,
  EdgeSchema,
  PropertyValueSchema,
  TemporalMetadataSchema,
} from '@canopy/schema';
import { map } from 'remeda';

// Helper types for storage (Plain Objects)
type StorableProperties = Record<string, PropertyValue>;

interface StorableNode extends Omit<Node, 'properties'> {
  readonly properties: StorableProperties;
}

interface StorableEdge extends Omit<Edge, 'properties'> {
  readonly properties: StorableProperties;
}

// Zod schemas for Storable types
// StorableProperties is just a Record<string, PropertyValue>.
// PropertyValueSchema is already a ZodType<PropertyValue>.
const StorablePropertiesSchema = z.record(z.string(), PropertyValueSchema);

const StorableNodeSchema: z.ZodType<StorableNode, z.ZodTypeDef, unknown> = z.object({
    id: z.string().transform(val => asNodeId(val)),
    type: z.string().transform(val => asTypeId(val)),
    properties: StorablePropertiesSchema,
    metadata: TemporalMetadataSchema
});

const StorableEdgeSchema: z.ZodType<StorableEdge, z.ZodTypeDef, unknown> = z.object({
    id: z.string().transform(val => asEdgeId(val)),
    type: z.string().transform(val => asTypeId(val)),
    source: z.string().transform(val => asNodeId(val)),
    target: z.string().transform(val => asNodeId(val)),
    properties: StorablePropertiesSchema,
    metadata: TemporalMetadataSchema
});


// Converters
const propertiesToStorable = (props: ReadonlyMap<string, PropertyValue>): StorableProperties => {
  return Object.fromEntries(props);
};

const storableToProperties = (props: StorableProperties): ReadonlyMap<string, PropertyValue> => {
  return new Map(Object.entries(props));
};

const nodeToStorable = (node: Node): StorableNode => {
  return {
    ...node,
    properties: propertiesToStorable(node.properties),
  };
};

const storableToNode = (storable: unknown): Node => {
    // Validate that the stored object matches the expected schema
    const n = StorableNodeSchema.parse(storable);
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
    const e = StorableEdgeSchema.parse(storable);
    return {
        ...e,
        properties: storableToProperties(e.properties)
    };
};

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
    data: Omit<Node, 'id' | 'metadata'> & {
      readonly id?: string;
    }
  ): Node {
    const now = createInstant();

    // Validate or generate ID safely
    const id: NodeId = data.id ? asNodeId(data.id) : createNodeId();

    const node: Node = {
      id,
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

  getAllNodes(): IterableIterator<Node> {
      return map(Array.from(this.nodes.values()), storableToNode)[Symbol.iterator]();
  }

  updateNode(id: string, partial: Partial<Omit<Node, 'id' | 'metadata'>>): Node {
    const existing = this.getNode(id);
    if (!existing) {
      throw new Error(`Node ${id} not found`);
    }

    const now = createInstant();
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
      readonly id?: string;
    }
  ): Edge {
    if (!this.nodes.has(data.source)) {
      throw new Error(`Source node ${data.source} not found`);
    }
    if (!this.nodes.has(data.target)) {
      throw new Error(`Target node ${data.target} not found`);
    }

    const now = createInstant();
    const id: EdgeId = data.id ? asEdgeId(data.id) : createEdgeId();

    const edge: Edge = {
      id,
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

  getAllEdges(): IterableIterator<Edge> {
      return map(Array.from(this.edges.values()), storableToEdge)[Symbol.iterator]();
  }

  updateEdge(id: string, partial: Partial<Omit<Edge, 'id' | 'metadata'>>): Edge {
      const existing = this.getEdge(id);
      if (!existing) {
          throw new Error(`Edge ${id} not found`);
      }

      const now = createInstant();
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
