import type * as Y from 'yjs';
import type { Node, Edge, Result, GraphEvent } from '@canopy/types';
import { fromThrowable } from '@canopy/types';
import * as NodeOps from './ops/node';
import * as EdgeOps from './ops/edge';
import { eventToStorable, storableToEvent } from './converters';

export interface GraphStore {
  readonly doc: Y.Doc;
  readonly nodes: Y.Map<unknown>;
  readonly edges: Y.Map<unknown>;
  readonly events: Y.Map<unknown>;

  readonly addNode: (
    data: Omit<Node, 'id' | 'metadata'> &
      Readonly<{
        id?: string;
      }>,
  ) => Result<Node, Error>;
  readonly getNode: (id: string) => Node | undefined;
  readonly getAllNodes: () => IterableIterator<Node>;
  readonly updateNode: (
    id: string,
    partial: Partial<Omit<Node, 'id' | 'metadata'>>,
  ) => Result<Node, Error>;
  readonly deleteNode: (id: string) => Result<void, Error>;

  readonly addEdge: (
    data: Omit<Edge, 'id' | 'metadata'> &
      Readonly<{
        id?: string;
      }>,
  ) => Result<Edge, Error>;
  readonly getEdge: (id: string) => Edge | undefined;
  readonly getAllEdges: () => IterableIterator<Edge>;
  readonly updateEdge: (
    id: string,
    partial: Partial<Omit<Edge, 'id' | 'metadata'>>,
  ) => Result<Edge, Error>;
  readonly deleteEdge: (id: string) => Result<void, Error>;

  readonly addEvent: (event: GraphEvent) => Result<void, Error>;
  readonly getEvents: () => IterableIterator<GraphEvent>;
}

export const createGraphStore = (doc: Y.Doc): GraphStore => {
  const nodes = doc.getMap('nodes');
  const edges = doc.getMap('edges');
  const events = doc.getMap('events');

  return {
    doc,
    nodes,
    edges,
    events,

    addNode: (
      data: Omit<Node, 'id' | 'metadata'> &
        Readonly<{
          id?: string;
        }>,
    ): Result<Node, Error> => {
      return NodeOps.addNode(nodes, data);
    },

    getNode: (id: string): Node | undefined => {
      const result = NodeOps.getNode(nodes, id);
      return result.ok ? result.value : undefined;
    },

    getAllNodes: (): IterableIterator<Node> => {
      const result = NodeOps.getAllNodes(nodes);
      if (result.ok) {
        return result.value;
      }
      // Fallback to empty iterator if error
      return [][Symbol.iterator]();
    },

    updateNode: (
      id: string,
      partial: Partial<Omit<Node, 'id' | 'metadata'>>,
    ): Result<Node, Error> => {
      return NodeOps.updateNode(nodes, id, partial);
    },

    deleteNode: (id: string): Result<void, Error> => {
      return NodeOps.deleteNode(nodes, id);
    },

    addEdge: (
      data: Omit<Edge, 'id' | 'metadata'> &
        Readonly<{
          id?: string;
        }>,
    ): Result<Edge, Error> => {
      return EdgeOps.addEdge(edges, nodes, data);
    },

    getEdge: (id: string): Edge | undefined => {
      const result = EdgeOps.getEdge(edges, id);
      return result.ok ? result.value : undefined;
    },

    getAllEdges: (): IterableIterator<Edge> => {
      const result = EdgeOps.getAllEdges(edges);
      if (result.ok) {
        return result.value;
      }
      return [][Symbol.iterator]();
    },

    updateEdge: (
      id: string,
      partial: Partial<Omit<Edge, 'id' | 'metadata'>>,
    ): Result<Edge, Error> => {
      return EdgeOps.updateEdge(edges, nodes, id, partial);
    },

    deleteEdge: (id: string): Result<void, Error> => {
      return EdgeOps.deleteEdge(edges, id);
    },

    addEvent: (event: GraphEvent): Result<void, Error> => {
      return fromThrowable(() => {
        events.set(event.eventId, eventToStorable(event));
        return undefined;
      });
    },

    getEvents: (): IterableIterator<GraphEvent> => {
      const result = fromThrowable(() => {
        const eventsList = [...events.values()].map(storableToEvent);
        // Sort by eventId (UUIDv7 is time-ordered)

        eventsList.sort((a, b) => a.eventId.localeCompare(b.eventId));
        return eventsList[Symbol.iterator]();
      });
      return result.ok ? result.value : [][Symbol.iterator]();
    },
  };
};
