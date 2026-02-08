import type { Graph, GraphEvent, Node, Edge, Result } from '@canopy/types';
import { ok, err } from '@canopy/types';

/**
 * Applies a single event to the graph, returning a new graph state.
 * This function is pure and does not mutate the input graph.
 */

export function applyEvent(graph: Graph, event: GraphEvent): Result<Graph, Error> {
  // eslint-disable-next-line functional/no-try-statements
  try {
    switch (event.type) {
      case 'NodeCreated': {
        if (graph.nodes.has(event.id)) {
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
        // eslint-disable-next-line functional/immutable-data
        newNodes.set(node.id, node);

        return ok({
          ...graph,
          nodes: newNodes,
          metadata: {
            ...graph.metadata,
            modified:
              // eslint-disable-next-line unicorn/prefer-math-min-max
              event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          },
        });
      }

      case 'NodePropertiesUpdated': {
        const node = graph.nodes.get(event.id);
        if (!node) {
          return err(new Error(`Node with ID ${event.id} not found`));
        }

        const updatedProperties = new Map(node.properties);
        // eslint-disable-next-line functional/no-loop-statements
        for (const [key, value] of event.changes) {
          // eslint-disable-next-line functional/immutable-data
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
        // eslint-disable-next-line functional/immutable-data
        newNodes.set(node.id, updatedNode);

        return ok({
          ...graph,
          nodes: newNodes,
          metadata: {
            ...graph.metadata,
            modified:
              // eslint-disable-next-line unicorn/prefer-math-min-max
              event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          },
        });
      }

      case 'NodeDeleted': {
        if (!graph.nodes.has(event.id)) {
          return ok(graph);
        }

        const newNodes = new Map(graph.nodes);
        // eslint-disable-next-line functional/immutable-data
        newNodes.delete(event.id);

        const edgesToRemove: Edge['id'][] = [];
        // eslint-disable-next-line functional/no-loop-statements
        for (const edge of graph.edges.values()) {
          if (edge.source === event.id || edge.target === event.id) {
            // eslint-disable-next-line functional/immutable-data
            edgesToRemove.push(edge.id);
          }
        }

        const newEdges = new Map(graph.edges);
        // eslint-disable-next-line functional/no-loop-statements
        for (const edgeId of edgesToRemove) {
          // eslint-disable-next-line functional/immutable-data
          newEdges.delete(edgeId);
        }

        return ok({
          ...graph,
          nodes: newNodes,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified:
              // eslint-disable-next-line unicorn/prefer-math-min-max
              event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          },
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
        // eslint-disable-next-line functional/immutable-data
        newEdges.set(edge.id, edge);

        return ok({
          ...graph,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified:
              // eslint-disable-next-line unicorn/prefer-math-min-max
              event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          },
        });
      }

      case 'EdgePropertiesUpdated': {
        const edge = graph.edges.get(event.id);
        if (!edge) {
          return err(new Error(`Edge with ID ${event.id} not found`));
        }

        const updatedProperties = new Map(edge.properties);
        // eslint-disable-next-line functional/no-loop-statements
        for (const [key, value] of event.changes) {
          // eslint-disable-next-line functional/immutable-data
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
        // eslint-disable-next-line functional/immutable-data
        newEdges.set(edge.id, updatedEdge);

        return ok({
          ...graph,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified:
              // eslint-disable-next-line unicorn/prefer-math-min-max
              event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          },
        });
      }

      case 'EdgeDeleted': {
        if (!graph.edges.has(event.id)) {
          return ok(graph);
        }

        const newEdges = new Map(graph.edges);
        // eslint-disable-next-line functional/immutable-data
        newEdges.delete(event.id);

        return ok({
          ...graph,
          edges: newEdges,
          metadata: {
            ...graph.metadata,
            modified:
              // eslint-disable-next-line unicorn/prefer-math-min-max
              event.timestamp > graph.metadata.modified ? event.timestamp : graph.metadata.modified,
          },
        });
      }

      default: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return err(new Error(`Unknown event type: ${(event as any).type}`));
      }
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
  initialGraph: Graph,
): Result<Graph, Error> {
  // eslint-disable-next-line functional/no-let
  let currentGraph = initialGraph;

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
