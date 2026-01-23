import type { NodeId, EdgeId, TypeId } from './identifiers';
import type { PropertyMap, PropertyChanges } from './properties';
import type { Instant } from './temporal';
import type { Graph } from './graph';

export type GraphEvent =
  | NodeCreated
  | NodePropertiesUpdated
  | NodeDeleted
  | EdgeCreated
  | EdgePropertiesUpdated
  | EdgeDeleted;

export interface NodeCreated {
  readonly type: 'NodeCreated';
  readonly id: NodeId;
  readonly nodeType: TypeId;
  readonly properties: PropertyMap;
  readonly timestamp: Instant;
}

export interface NodePropertiesUpdated {
  readonly type: 'NodePropertiesUpdated';
  readonly id: NodeId;
  readonly changes: PropertyChanges;
  readonly timestamp: Instant;
}

export interface NodeDeleted {
  readonly type: 'NodeDeleted';
  readonly id: NodeId;
  readonly timestamp: Instant;
}

export interface EdgeCreated {
  readonly type: 'EdgeCreated';
  readonly id: EdgeId;
  readonly edgeType: TypeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly properties: PropertyMap;
  readonly timestamp: Instant;
}

export interface EdgePropertiesUpdated {
  readonly type: 'EdgePropertiesUpdated';
  readonly id: EdgeId;
  readonly changes: PropertyChanges;
  readonly timestamp: Instant;
}

export interface EdgeDeleted {
  readonly type: 'EdgeDeleted';
  readonly id: EdgeId;
  readonly timestamp: Instant;
}

export interface GraphResult<T> {
  readonly graph: Graph;
  readonly events: readonly GraphEvent[];
  readonly value: T;
}
