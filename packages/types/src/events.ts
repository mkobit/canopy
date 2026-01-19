import type { Node } from './node';
import type { Edge } from './edge';
import type { NodeId, EdgeId } from './identifiers';
import type { Graph } from './graph';

export type GraphEvent =
  | { type: 'NODE_CREATED'; node: Node }
  | { type: 'NODE_UPDATED'; nodeId: NodeId; changes: Partial<Node> }
  | { type: 'NODE_DELETED'; nodeId: NodeId }
  | { type: 'EDGE_CREATED'; edge: Edge }
  | { type: 'EDGE_UPDATED'; edgeId: EdgeId; changes: Partial<Edge> }
  | { type: 'EDGE_DELETED'; edgeId: EdgeId };

export interface GraphResult<T> {
  graph: Graph;
  events: readonly GraphEvent[];
  value: T;
}
