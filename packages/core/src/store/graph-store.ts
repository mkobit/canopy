import * as Y from 'yjs';
import { v4 as uuidv4 } from 'uuid';
import {
  Node,
  Edge,
  NodeSchema,
  EdgeSchema,
  NodeType,
  EdgeType,
  NodeTypeSchema,
  EdgeTypeSchema,
} from '@canopy/schema';

export class GraphStore {
  doc: Y.Doc;
  nodes: Y.Map<Node>;
  edges: Y.Map<Edge>;

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.nodes = doc.getMap('nodes');
    this.edges = doc.getMap('edges');
  }

  addNode(
    data: Omit<Node, 'id' | 'created' | 'modified'> & {
      id?: string;
      created?: string;
      modified?: string;
    }
  ): Node {
    // Check if type exists (if it's not a meta-type itself)
    if (data.type !== 'NodeType' && data.type !== 'EdgeType') {
      this.validateType(data.type, data.properties, 'node');
    }

    const now = new Date().toISOString();
    const node: Node = {
      id: data.id || uuidv4(),
      type: data.type,
      properties: data.properties,
      created: data.created || now,
      modified: data.modified || now,
    };

    // Validate schema
    NodeSchema.parse(node);

    // If it's a NodeType, validate against NodeTypeSchema
    if (node.type === 'NodeType') {
      NodeTypeSchema.parse(node);
    }

    this.nodes.set(node.id, node);
    return node;
  }

  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  updateNode(id: string, partial: Partial<Omit<Node, 'id' | 'created'>>): Node {
    const existing = this.getNode(id);
    if (!existing) {
      throw new Error(`Node ${id} not found`);
    }

    const updated: Node = {
      ...existing,
      ...partial,
      modified: new Date().toISOString(),
    };

    // If type is changing, re-validate
    if (partial.type && partial.type !== existing.type) {
        if (updated.type !== 'NodeType' && updated.type !== 'EdgeType') {
             this.validateType(updated.type, updated.properties, 'node');
        }
    } else if (partial.properties) {
        // If properties changing, re-validate against existing type
         if (updated.type !== 'NodeType' && updated.type !== 'EdgeType') {
             this.validateType(updated.type, updated.properties, 'node');
        }
    }

    NodeSchema.parse(updated);
     if (updated.type === 'NodeType') {
      NodeTypeSchema.parse(updated);
    }

    this.nodes.set(id, updated);
    return updated;
  }

  deleteNode(id: string): void {
    if (!this.nodes.has(id)) {
      throw new Error(`Node ${id} not found`);
    }
    this.nodes.delete(id);
    // TODO: Cleanup edges? Yjs doesn't enforce referential integrity automatically.
    // For now, we leave dangling edges or we should implement a cleanup.
    // Requirement says "Basic query execution", doesn't explicitly mention cascade delete.
    // I'll leave it for now but note it.
  }

  addEdge(
    data: Omit<Edge, 'id' | 'created' | 'modified'> & {
      id?: string;
      created?: string;
      modified?: string;
    }
  ): Edge {
    // Check if source and target exist
    if (!this.nodes.has(data.source)) {
      throw new Error(`Source node ${data.source} not found`);
    }
    if (!this.nodes.has(data.target)) {
      throw new Error(`Target node ${data.target} not found`);
    }

    if (data.type !== 'EdgeType') {
        this.validateType(data.type, data.properties, 'edge');
    }

    const now = new Date().toISOString();
    const edge: Edge = {
      id: data.id || uuidv4(),
      source: data.source,
      target: data.target,
      type: data.type,
      properties: data.properties,
      created: data.created || now,
      modified: data.modified || now,
    };

    EdgeSchema.parse(edge);

    if (edge.type === 'EdgeType') {
        EdgeTypeSchema.parse(edge);
    }

    this.edges.set(edge.id, edge);
    return edge;
  }

  getEdge(id: string): Edge | undefined {
    return this.edges.get(id);
  }

  updateEdge(id: string, partial: Partial<Omit<Edge, 'id' | 'created'>>): Edge {
      const existing = this.getEdge(id);
      if (!existing) {
          throw new Error(`Edge ${id} not found`);
      }

      const updated: Edge = {
          ...existing,
          ...partial,
          modified: new Date().toISOString(),
      };

       // Check if source and target exist if they are being updated
        if (partial.source && !this.nodes.has(partial.source)) {
            throw new Error(`Source node ${partial.source} not found`);
        }
        if (partial.target && !this.nodes.has(partial.target)) {
            throw new Error(`Target node ${partial.target} not found`);
        }

       if (updated.type !== 'EdgeType') {
          this.validateType(updated.type, updated.properties, 'edge');
       }

      EdgeSchema.parse(updated);
      this.edges.set(id, updated);
      return updated;
  }

  deleteEdge(id: string): void {
      if (!this.edges.has(id)) {
          throw new Error(`Edge ${id} not found`);
      }
      this.edges.delete(id);
  }

  private validateType(typeName: string, properties: Record<string, unknown>, kind: 'node' | 'edge') {
    // Find the definition node/edge
    // For NodeType, it's a Node with type="NodeType" and properties.name = typeName
    // For EdgeType, it might be a Node with type="EdgeType"? Wait, schema said EdgeTypeSchema extends NodeSchema.
    // So both are Nodes.

    // We need to scan nodes to find the type definition.
    // In a real database, this would be indexed. Here we iterate.
    const definitionNode = Array.from(this.nodes.values()).find(
        (n: Node) => n.type === (kind === 'node' ? 'NodeType' : 'EdgeType') && n.properties.name === typeName
    );

    if (!definitionNode) {
      // If type definition is missing, do we allow?
      // "Validate nodes against NodeType definitions" implies definitions exist.
      // But maybe we allow strict or loose mode?
      // Requirement: "Runtime checks that throw on invalid operations"
      // Acceptance Criteria:
      // createNode({ type: "Person", properties: { age: 30 } }); // ✗ throws - missing required 'name'
      // This implies "Person" type must be defined.
      // However, if I can't find the type definition, maybe I should assume it's invalid type?
      // Or maybe I should throw "Type not defined"?
      // I'll throw "Type not defined" for now, unless it's a primitive or we are bootstrapping.
      // But how do we bootstrap "NodeType"? It is hardcoded in the class logic above (I skipped validation for it).
      throw new Error(`Type definition for ${typeName} not found`);
    }

    // Now validate properties against definition
    // definitionNode is typed as Node, but we know it follows NodeTypeSchema/EdgeTypeSchema
    const def = definitionNode as NodeType | EdgeType; // Cast for easier access

    // properties is Record<string, any>
    // def.properties.properties is Array<PropertyDefinition>
    const propDefs = def.properties.properties;

    for (const propDef of propDefs) {
        if (propDef.required && !(propDef.name in properties)) {
            throw new Error(`Missing required property: ${propDef.name}`);
        }

        if (propDef.name in properties) {
            const value = properties[propDef.name];
            // Basic type check
            if (propDef.type === 'string' && typeof value !== 'string') throw new Error(`Property ${propDef.name} must be a string`);
            if (propDef.type === 'number' && typeof value !== 'number') throw new Error(`Property ${propDef.name} must be a number`);
            if (propDef.type === 'boolean' && typeof value !== 'boolean') throw new Error(`Property ${propDef.name} must be a boolean`);
            // date check?
             if (propDef.type === 'date' && typeof value !== 'string') throw new Error(`Property ${propDef.name} must be a date string`);
             // We could be stricter on date format
        }
    }
  }
}
