import type { EdgeId, NodeId, PropertyValue, Result, TypeId } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';
import type { ApiAdapterContext } from './api-context';
import type { ApiAdapterError } from './result-errors';

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
