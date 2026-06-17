import type { Graph } from './graph';
import type { Node } from './node';
import type { Edge } from './edge';
import type { NodeId, EdgeId } from './identifiers';
import { filter } from 'remeda';

/**
 * Retrieves a node by ID.
 */
export function getNode(graph: Graph, id: NodeId): Node | undefined {
  return graph.nodes.get(id);
}

/**
 * Retrieves an edge by ID.
 */
export function getEdge(graph: Graph, id: EdgeId): Edge | undefined {
  return graph.edges.get(id);
}

/**
 * Retrieves all edges incoming to a node.
 */
export function getEdgesTo(graph: Graph, nodeId: NodeId): readonly Edge[] {
  return filter([...graph.edges.values()], (edge) => edge.target === nodeId);
}
