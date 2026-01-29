import type { Graph, GraphEvent, Node, Edge, Result } from '@canopy/types';
import { ok, err } from '@canopy/types';

/**
 * Applies a single event to the graph, returning a new graph state.
 * This function is pure and does not mutate the input graph.
 */
export function applyEvent(graph: Graph, event: GraphEvent): Result<Graph, Error> {
  try {
    switch (event.type) {
      case 'NodeCreated': {
        if (graph.nodes.has(event.id)) {
          // Idempotency: if node already exists with same state, ignore?
          // Or strictly error? For time travel, we might encounter history where ID reused?
          // UUIDs shouldn't collide.
          // If we are replaying history, we might start from empty.
          // If the event stream contains duplicates, we should maybe be robust?
          // But strict event sourcing usually implies unique events.
          // I'll return error for now to match `ops`.
          return err(new Error(`Node with ID ${event.id} already exists`));
        }

        const node: Node = {
          id: event.id,
          type: event.nodeType,
          properties: event.properties,
          metadata: {
            created: event.timestamp,
            modified: event.timestamp,
          },
        };

        const newNodes = new Map(graph.nodes);
        newNodes.set(node.id, node);

        return ok({
          ...graph,
          nodes: newNodes,
          metadata: {
            ...graph.metadata,
            modified: event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          }
        });
      }

      case 'NodePropertiesUpdated': {
        const node = graph.nodes.get(event.id);
        if (!node) {
          return err(new Error(`Node with ID ${event.id} not found`));
        }

        const updatedProperties = new Map(node.properties);
        for (const [key, value] of event.changes) {
          updatedProperties.set(key, value);
        }

        const updatedNode: Node = {
          ...node,
          properties: updatedProperties,
          metadata: {
            ...node.metadata,
            modified: event.timestamp,
          },
        };

        const newNodes = new Map(graph.nodes);
        newNodes.set(node.id, updatedNode);

        return ok({
          ...graph,
          nodes: newNodes,
          metadata: {
            ...graph.metadata,
            modified: event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          }
        });
      }

      case 'NodeDeleted': {
        if (!graph.nodes.has(event.id)) {
           // Idempotency: if already deleted, fine.
           // But if we strictly follow ops, it might be error.
           // Let's just return current graph if not found (idempotent delete).
           return ok(graph);
        }

        const newNodes = new Map(graph.nodes);
        newNodes.delete(event.id);

        // Also remove connected edges
        const edgesToRemove = [];
        for (const edge of graph.edges.values()) {
          if (edge.source === event.id || edge.target === event.id) {
            edgesToRemove.push(edge.id);
          }
        }

        const newEdges = new Map(graph.edges);
        for (const edgeId of edgesToRemove) {
          newEdges.delete(edgeId);
        }

        return ok({
          ...graph,
          nodes: newNodes,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified: event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          }
        });
      }

      case 'EdgeCreated': {
        if (graph.edges.has(event.id)) {
          return err(new Error(`Edge with ID ${event.id} already exists`));
        }
        if (!graph.nodes.has(event.source)) {
          return err(new Error(`Source node ${event.source} not found`));
        }
        if (!graph.nodes.has(event.target)) {
          return err(new Error(`Target node ${event.target} not found`));
        }

        const edge: Edge = {
          id: event.id,
          type: event.edgeType,
          source: event.source,
          target: event.target,
          properties: event.properties,
          metadata: {
            created: event.timestamp,
            modified: event.timestamp,
          },
        };

        const newEdges = new Map(graph.edges);
        newEdges.set(edge.id, edge);

        return ok({
          ...graph,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified: event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          }
        });
      }

      case 'EdgePropertiesUpdated': {
        const edge = graph.edges.get(event.id);
        if (!edge) {
          return err(new Error(`Edge with ID ${event.id} not found`));
        }

        const updatedProperties = new Map(edge.properties);
        for (const [key, value] of event.changes) {
          updatedProperties.set(key, value);
        }

        const updatedEdge: Edge = {
          ...edge,
          properties: updatedProperties,
          metadata: {
            ...edge.metadata,
            modified: event.timestamp,
          },
        };

        const newEdges = new Map(graph.edges);
        newEdges.set(edge.id, updatedEdge);

        return ok({
          ...graph,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified: event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          }
        });
      }

      case 'EdgeDeleted': {
        if (!graph.edges.has(event.id)) {
          return ok(graph);
        }

        const newEdges = new Map(graph.edges);
        newEdges.delete(event.id);

        return ok({
          ...graph,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified: event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          }
        });
      }

      default:
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return err(new Error(`Unknown event type: ${(event as any).type}`));
    }
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Reconstructs a graph from a stream of events.
 * Optionally accepts an initial graph state.
 */
export function projectGraph(
  events: readonly GraphEvent[],
  initialGraph?: Graph,
): Result<Graph, Error> {
  let currentGraph: Graph;

  if (initialGraph) {
    currentGraph = initialGraph;
  } else {
    // If no initial graph, we can't really start without an ID.
    // However, usually we start with an empty graph created via createGraph.
    // But createGraph requires an ID.
    // If the caller doesn't provide one, we can't assume one.
    // But typically the first event might establish context? No, events refer to IDs.
    // The caller should provide the initial empty graph if starting from scratch.
    // Or we create a dummy one if valid?
    // Let's require initialGraph to be valid if provided, or fail if not provided?
    // Actually, `projectGraph` usually implies "folding" events.
    // If I return Result<Graph>, I need a valid Graph to start.
    if (!initialGraph) {
        return err(new Error("Initial graph must be provided to projectGraph"));
    }
    currentGraph = initialGraph;
  }

  for (const event of events) {
    const result = applyEvent(currentGraph, event);
    if (!result.ok) {
      return result;
    }
    currentGraph = result.value;
  }

  return ok(currentGraph);
}
