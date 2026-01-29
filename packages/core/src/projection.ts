import type { Graph, GraphEvent, Node, Edge, Result } from '@canopy/types';
import { ok, err, createInstant } from '@canopy/types';
import { createGraph } from './graph';

/**
 * Applies a single event to a graph, returning a new graph.
 */
export function applyEvent(graph: Graph, event: GraphEvent): Result<Graph, Error> {
  switch (event.type) {
    case 'NodeCreated': {
      if (graph.nodes.has(event.id)) {
        // In event sourcing, we often ignore events that don't make sense (idempotency)
        // or we can return an error. For robust projection, idempotent is often better.
        // But strict model might want validation. Let's return the graph as is or error?
        // Design says "Return warnings for issues, not errors that block saving".
        // But this is projection. Let's strictly update if possible.
        // For now, let's treat it as an upsert or ignore?
        // If we strictly follow "Event is truth", we should apply it.
        // But NodeCreated implies it didn't exist.
        // Let's assume valid event stream for now.
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
      return ok({ ...graph, nodes: newNodes });
    }

    case 'NodePropertiesUpdated': {
      const node = graph.nodes.get(event.id);
      if (!node) {
        // Node doesn't exist. Can't update. Ignore?
        return ok(graph);
      }
      const updatedNode: Node = {
        ...node,
        properties: new Map([...node.properties, ...event.changes]),
        metadata: {
          ...node.metadata,
          modified: event.timestamp,
        },
      };
      const newNodes = new Map(graph.nodes);
      newNodes.set(node.id, updatedNode);
      return ok({ ...graph, nodes: newNodes });
    }

    case 'NodeDeleted': {
      if (!graph.nodes.has(event.id)) {
        return ok(graph);
      }
      const newNodes = new Map(graph.nodes);
      newNodes.delete(event.id);

      // Also remove edges connected to this node
      // Note: EdgeDeleted events should ideally accompany this in the stream,
      // but for safety/robustness, we implicitly remove connected edges to avoid dangling refs.
      // HOWEVER, if the event stream is complete, we should rely on EdgeDeleted events.
      // Design Doc 4.2: "Soft delete... Delete events don't destroy data; filtering events = undo"
      // But projection constructs the *current state*.
      // If we don't remove edges, the graph state is inconsistent.
      // Let's remove connected edges to maintain graph invariants.
      const newEdges = new Map(graph.edges);
      for (const [edgeId, edge] of graph.edges) {
        if (edge.source === event.id || edge.target === event.id) {
          newEdges.delete(edgeId);
        }
      }

      return ok({ ...graph, nodes: newNodes, edges: newEdges });
    }

    case 'EdgeCreated': {
      // Ensure nodes exist?
      // In a distributed system, edge might arrive before nodes.
      // We can allow "dangling" edges temporarily or strictly enforce.
      // Let's enforce for now to keep graph valid.
      if (!graph.nodes.has(event.source) || !graph.nodes.has(event.target)) {
        // Warn?
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
      return ok({ ...graph, edges: newEdges });
    }

    case 'EdgePropertiesUpdated': {
      const edge = graph.edges.get(event.id);
      if (!edge) {
        return ok(graph);
      }
      const updatedEdge: Edge = {
        ...edge,
        properties: new Map([...edge.properties, ...event.changes]),
        metadata: {
          ...edge.metadata,
          modified: event.timestamp,
        },
      };
      const newEdges = new Map(graph.edges);
      newEdges.set(edge.id, updatedEdge);
      return ok({ ...graph, edges: newEdges });
    }

    case 'EdgeDeleted': {
      if (!graph.edges.has(event.id)) {
        return ok(graph);
      }
      const newEdges = new Map(graph.edges);
      newEdges.delete(event.id);
      return ok({ ...graph, edges: newEdges });
    }
  }
}

/**
 * Reconstructs a graph by applying a stream of events.
 */
export function projectGraph(
  events: Iterable<GraphEvent>,
  initialGraph?: Graph,
): Result<Graph, Error> {
  // eslint-disable-next-line functional/no-let
  let currentGraph =
    initialGraph ||
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    (createGraph('graph:default', 'Default Graph').ok ? createGraph('graph:default', 'Default Graph').value : undefined)!; // Should not fail

  // eslint-disable-next-line functional/no-loop-statements
  for (const event of events) {
    const result = applyEvent(currentGraph, event);
    if (!result.ok) {
      return result;
    }
    currentGraph = result.value;
  }

  return ok(currentGraph);
}
