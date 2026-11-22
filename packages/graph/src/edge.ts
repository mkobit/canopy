import type { EdgeId, NodeId, ShapeId } from './identifiers';
import type { TemporalMetadata } from './temporal';
import type { PropertyMap } from './properties';

/**
An edge connecting two nodes within the same graph.
Edges are first-class citizens with their own typed properties.

Edges are always directional (source → target).
Bidirectional traversal is a query concern, not a data concern.
*/
export type Edge<S extends ShapeId = ShapeId> = Readonly<{
  id: EdgeId;
  shape?: S | undefined;
  source: NodeId;
  target: NodeId;
  properties: PropertyMap;
  metadata: TemporalMetadata;
}>;
