import type {
  NodeId,
  EdgeId,
  ShapeId,
  BatchId,
  EventId,
  DeviceId,
  CommitSeq,
  PrincipalId,
  ActorId,
} from './identifiers';
import type { ActorKind, HlcTimestamp } from './hlc';
import type { PropertyMap } from './properties';
import type { Instant } from './temporal';
import type { Graph } from './graph';

export type GraphEvent =
  | NodeCreated
  | NodePropertiesUpdated
  | NodeDeleted
  | EdgeCreated
  | EdgePropertiesUpdated
  | EdgeDeleted
  | WorkflowStarted
  | WorkflowCompleted;

export interface GraphEventMetadata {
  readonly eventId: EventId;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: BatchId | undefined;
  readonly hlcTimestamp?: HlcTimestamp | undefined;
  readonly commitSeq?: CommitSeq | undefined;
  readonly principalId?: PrincipalId | undefined;
  readonly actorId?: ActorId | undefined;
  readonly actorKind?: ActorKind | undefined;
}

export interface WorkflowStarted extends GraphEventMetadata {
  readonly type: 'WorkflowStarted';
  readonly workflowId: NodeId;
  readonly triggerId: NodeId;
}

export interface WorkflowCompleted extends GraphEventMetadata {
  readonly type: 'WorkflowCompleted';
  readonly executionId: EventId;
}

export interface NodeCreated extends GraphEventMetadata {
  readonly type: 'NodeCreated';
  readonly id: NodeId;
  readonly shapeId?: ShapeId | undefined;
  readonly properties: PropertyMap;
  readonly migrationId?: string | undefined;
}

export interface NodePropertiesUpdated extends GraphEventMetadata {
  readonly type: 'NodePropertiesUpdated';
  readonly id: NodeId;
  readonly changes: PropertyMap; // Contains only the changed properties
  readonly migrationId?: string | undefined;
}

export interface NodeDeleted extends GraphEventMetadata {
  readonly type: 'NodeDeleted';
  readonly id: NodeId;
  readonly migrationId?: string | undefined;
}

export interface EdgeCreated extends GraphEventMetadata {
  readonly type: 'EdgeCreated';
  readonly id: EdgeId;
  readonly shapeId?: ShapeId | undefined;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly properties: PropertyMap;
  readonly migrationId?: string | undefined;
}

export interface EdgePropertiesUpdated extends GraphEventMetadata {
  readonly type: 'EdgePropertiesUpdated';
  readonly id: EdgeId;
  readonly changes: PropertyMap; // Contains only the changed properties
  readonly migrationId?: string | undefined;
}

export interface EdgeDeleted extends GraphEventMetadata {
  readonly type: 'EdgeDeleted';
  readonly id: EdgeId;
  readonly migrationId?: string | undefined;
}

export interface GraphResult<T> {
  readonly graph: Graph;
  readonly events: readonly GraphEvent[];
  readonly value: T;
}
