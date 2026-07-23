import type {
  EdgeId,
  EventId,
  GraphEvent,
  NodeId,
  PropertyValue,
  Result,
  TypeId,
} from '@canopy/graph';
import type { Filter, Sort } from '@canopy/queries';
import { Temporal } from 'temporal-polyfill';
import type { ApiAdapterContext } from './api-context';
import type { ApiAdapterError } from './result-errors';

export type NodeQueryPayload = Readonly<{
  id?: NodeId;
  type?: TypeId;
  filter?: Filter;
  sort?: Sort;
  limit?: number;
}>;

export type EdgeQueryPayload = Readonly<{
  id?: EdgeId;
  type?: TypeId;
  source?: NodeId;
  target?: NodeId;
  direction?: 'in' | 'out' | 'both';
  includeTargetSummary?: boolean;
  limit?: number;
}>;

export type PropertyLookupPayload = Readonly<{
  entityId: NodeId | EdgeId;
  propertyKey?: string;
}>;

export type TraversalQueryPayload = Readonly<{
  startNodeIds: readonly NodeId[];
  edgeType?: TypeId;
  direction?: 'in' | 'out' | 'both';
  maxDepth?: number;
  maxCost?: number;
}>;

export type PropertyLookupResult = Readonly<{
  entityId: NodeId | EdgeId;
  properties: Readonly<Record<string, PropertyValue>>;
}>;

export type NodeCreatePayload = Readonly<{
  id?: NodeId;
  type: TypeId;
  properties: Readonly<Record<string, PropertyValue>>;
  expectedSequence?: number;
}>;

export type NodeUpdatePropertiesPayload = Readonly<{
  id: NodeId;
  properties: Readonly<Record<string, PropertyValue>>;
  expectedSequence?: number;
}>;

export type NodeDeletePayload = Readonly<{
  id: NodeId;
  expectedSequence?: number;
}>;

export type EdgeCreatePayload = Readonly<{
  id?: EdgeId;
  type: TypeId;
  source: NodeId;
  target: NodeId;
  properties?: Readonly<Record<string, PropertyValue>>;
  expectedSequence?: number;
}>;

export type EdgeDeletePayload = Readonly<{
  id: EdgeId;
  expectedSequence?: number;
}>;

export type MutationResultPayload = Readonly<{
  id: string;
  success: boolean;
  affectedEventsCount: number;
}>;

export type ApiRequest<TPayload = unknown> = Readonly<{
  id: string;
  context: ApiAdapterContext;
  payload: TPayload;
  timestamp: number;
}>;

export type ApiResponse<TData = unknown, TError = ApiAdapterError> = Result<TData, TError>;

export type ApiNodePayload = Readonly<{
  id: NodeId;
  type: TypeId;
  properties: Readonly<Record<string, PropertyValue>>;
  createdAt: string;
  updatedAt: string;
}>;

export type ApiEdgePayload = Readonly<{
  id: EdgeId;
  type: TypeId;
  source: NodeId;
  target: NodeId;
  properties: Readonly<Record<string, PropertyValue>>;
}>;

export type ApiTraversalPayload = Readonly<{
  nodes: readonly ApiNodePayload[];
  edges: readonly ApiEdgePayload[];
}>;

export type StreamMessageKind = 'event' | 'gap' | 'overflow_disconnect' | 'end';

export interface EventStreamMessage {
  readonly kind: StreamMessageKind;
  readonly event?: GraphEvent;
  readonly events?: readonly GraphEvent[];
  readonly gapCount?: number;
  readonly lastSeenEventId?: EventId | string;
  readonly reason?: string;
}

export interface EventStreamOptions {
  readonly bufferCapacity?: number;
  readonly maxReplayCount?: number;
}

export interface ReplayRequestPayload {
  readonly tenantId: string;
  readonly graphId: string;
  readonly lastSeenEventId: string;
  readonly maxReplayCount?: number;
}

export const createApiRequest = <TPayload>(
  id: string,
  context: ApiAdapterContext,
  payload: TPayload,
  timestamp?: number,
): ApiRequest<TPayload> => ({
  id,
  context,
  payload,
  timestamp: timestamp ?? Temporal.Now.instant().epochMilliseconds,
});

export { err as createApiErrorResponse, ok as createApiSuccessResponse } from '@canopy/graph';
