import type * as Y from 'yjs';
import type { Node, Edge, Result, GraphEvent } from '@canopy/types';
import { ok, err } from '@canopy/types';
import * as NodeOps from './ops/node';
import * as EdgeOps from './ops/edge';
import { eventToStorable, storableToEvent } from './converters';

// eslint-disable-next-line functional/no-classes
export class GraphStore {
  readonly doc: Y.Doc;
  readonly nodes: Y.Map<unknown>; // Stored as plain JSON object
  readonly edges: Y.Map<unknown>;
  readonly events: Y.Map<unknown>;

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.nodes = doc.getMap('nodes');
    this.edges = doc.getMap('edges');
    this.events = doc.getMap('events');
  }

  addNode(
    data: Omit<Node, 'id' | 'metadata'> &
      Readonly<{
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
    data: Omit<Edge, 'id' | 'metadata'> &
      Readonly<{
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

  addEvent(event: GraphEvent): Result<void, Error> {
    // eslint-disable-next-line functional/no-try-statements
    try {
      this.events.set(event.eventId, eventToStorable(event));
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  getEvents(): IterableIterator<GraphEvent> {
    // eslint-disable-next-line functional/no-try-statements
    try {
      const events = Array.from(this.events.values()).map(storableToEvent);
      // Sort by eventId (UUIDv7 is time-ordered)
      events.sort((a, b) => a.eventId.localeCompare(b.eventId));
      return events[Symbol.iterator]();
    } catch (error) {
      return [][Symbol.iterator]();
    }
  }
}
