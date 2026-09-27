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
import type { GraphAccessContext } from './graph-access-context';
import type { GraphAccessError } from './result-errors';

export type NodeQueryPayload = Readonly<{
  id?: NodeId | undefined;
  type?: TypeId | undefined;
  filter?: Filter | undefined;
  sort?: Sort | undefined;
  limit?: number | undefined;
}>;

export type EdgeQueryPayload = Readonly<{
  id?: EdgeId | undefined;
  type?: TypeId | undefined;
  source?: NodeId | undefined;
  target?: NodeId | undefined;
  direction?: 'in' | 'out' | 'both' | undefined;
  includeTargetSummary?: boolean | undefined;
  limit?: number | undefined;
}>;

export type PropertyLookupPayload = Readonly<{
  entityId: NodeId | EdgeId;
  propertyKey?: string | undefined;
}>;

export type TraversalQueryPayload = Readonly<{
  startNodeIds: readonly NodeId[];
  edgeType?: TypeId | undefined;
  direction?: 'in' | 'out' | 'both' | undefined;
  maxDepth?: number | undefined;
  maxCost?: number | undefined;
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

export type GraphAccessRequest<TPayload = unknown> = Readonly<{
  id: string;
  context: GraphAccessContext;
  payload: TPayload;
  timestamp: number;
}>;

export type GraphAccessResponse<TData = unknown, TError = GraphAccessError> = Result<TData, TError>;

export type GraphAccessNodePayload = Readonly<{
  id: NodeId;
  type: TypeId;
  properties: Readonly<Record<string, PropertyValue>>;
  createdAt: string;
  updatedAt: string;
}>;

export type GraphAccessEdgePayload = Readonly<{
  id: EdgeId;
  type: TypeId;
  source: NodeId;
  target: NodeId;
  properties: Readonly<Record<string, PropertyValue>>;
}>;

export type GraphAccessTraversalPayload = Readonly<{
  nodes: readonly GraphAccessNodePayload[];
  edges: readonly GraphAccessEdgePayload[];
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

export const createGraphAccessRequest = <TPayload>(
  id: string,
  context: GraphAccessContext,
  payload: TPayload,
  timestamp?: number,
): GraphAccessRequest<TPayload> => ({
  id,
  context,
  payload,
  timestamp: timestamp ?? Temporal.Now.instant().epochMilliseconds,
});

export {
  err as createGraphAccessErrorResponse,
  ok as createGraphAccessSuccessResponse,
} from '@canopy/graph';
