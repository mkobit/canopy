import type { NodeId, ShapeId } from './identifiers';
import type { TemporalMetadata } from './temporal';
import type { PropertyMap } from './properties';

/**
A node in the graph.
Nodes are the primary entities—everything is a node.
Generic parameter S allows narrowing to specific node shapes.
*/
export type Node<S extends ShapeId = ShapeId> = Readonly<{
  id: NodeId;
  shape?: S | undefined;
  properties: PropertyMap;
  metadata: TemporalMetadata;
}>;
