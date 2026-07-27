import type { EventLogStore, Graph, GraphSession } from '@canopy/graph';

export type ApiAuthContext = Readonly<{
  tenantId?: string;
  userId?: string;
  roles?: readonly string[];
  scopes?: readonly string[];
}>;

export type ApiLimits = Readonly<{
  maxQueryDepth?: number;
  maxQueryCost?: number;
  maxStreamBuffer?: number;
  wasmFuelLimit?: bigint;
}>;

export const defaultApiLimits: ApiLimits = {
  maxQueryDepth: 10,
  maxQueryCost: 1000,
  maxStreamBuffer: 1000,
  wasmFuelLimit: 1_000_000n,
};

export type ApiAdapterContext = Readonly<{
  graph: Graph;
  session?: GraphSession;
  eventLogStore?: EventLogStore;
  authContext?: ApiAuthContext;
  limits?: ApiLimits;
}>;

export const createApiAdapterContext = (
  parameters: Readonly<{
    graph: Graph;
    session?: GraphSession;
    eventLogStore?: EventLogStore;
    authContext?: ApiAuthContext;
    limits?: ApiLimits;
  }>,
): ApiAdapterContext => ({
  graph: parameters.graph,
  limits: parameters.limits ?? defaultApiLimits,
  ...(parameters.session && { session: parameters.session }),
  ...(parameters.eventLogStore && { eventLogStore: parameters.eventLogStore }),
  ...(parameters.authContext && { authContext: parameters.authContext }),
});
