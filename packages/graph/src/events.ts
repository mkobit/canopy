import type { NodeId, EdgeId, TypeId, EventId, DeviceId } from './identifiers';
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

export interface WorkflowStarted {
  readonly type: 'WorkflowStarted';
  readonly eventId: EventId;
  readonly workflowId: NodeId;
  readonly triggerId: NodeId;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
}

export interface WorkflowCompleted {
  readonly type: 'WorkflowCompleted';
  readonly eventId: EventId;
  readonly executionId: EventId;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
}

export interface NodeCreated {
  readonly type: 'NodeCreated';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly nodeType: TypeId;
  readonly properties: PropertyMap;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
  readonly migrationId?: string | undefined;
}

export interface NodePropertiesUpdated {
  readonly type: 'NodePropertiesUpdated';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly changes: PropertyMap; // Contains only the changed properties
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
  readonly migrationId?: string | undefined;
}

export interface NodeDeleted {
  readonly type: 'NodeDeleted';
  readonly eventId: EventId;
  readonly id: NodeId;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
  readonly migrationId?: string | undefined;
}

export interface EdgeCreated {
  readonly type: 'EdgeCreated';
  readonly eventId: EventId;
  readonly id: EdgeId;
  readonly edgeType: TypeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly properties: PropertyMap;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
  readonly migrationId?: string | undefined;
}

export interface EdgePropertiesUpdated {
  readonly type: 'EdgePropertiesUpdated';
  readonly eventId: EventId;
  readonly id: EdgeId;
  readonly changes: PropertyMap; // Contains only the changed properties
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
  readonly migrationId?: string | undefined;
}

export interface EdgeDeleted {
  readonly type: 'EdgeDeleted';
  readonly eventId: EventId;
  readonly id: EdgeId;
  readonly timestamp: Instant;
  readonly deviceId: DeviceId;
  readonly batchId?: string | undefined;
  readonly migrationId?: string | undefined;
}

export interface GraphResult<T> {
  readonly graph: Graph;
  readonly events: readonly GraphEvent[];
  readonly value: T;
}
