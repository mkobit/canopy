import type { EventLogStore, Graph, GraphSession } from '@canopy/graph';

export type GraphAccessAuthContext = Readonly<{
  tenantId?: string;
  userId?: string;
  roles?: readonly string[];
  scopes?: readonly string[];
}>;

export type GraphAccessLimits = Readonly<{
  maxQueryDepth?: number;
  maxQueryCost?: number;
  maxStreamBuffer?: number;
}>;

export const defaultGraphAccessLimits: GraphAccessLimits = {
  maxQueryDepth: 10,
  maxQueryCost: 1000,
  maxStreamBuffer: 1000,
};

export type GraphAccessContext = Readonly<{
  graph: Graph;
  session?: GraphSession;
  eventLogStore?: EventLogStore;
  authContext?: GraphAccessAuthContext;
  limits?: GraphAccessLimits;
}>;

export const createGraphAccessContext = (
  parameters: Readonly<{
    graph: Graph;
    session?: GraphSession;
    eventLogStore?: EventLogStore;
    authContext?: GraphAccessAuthContext;
    limits?: GraphAccessLimits;
  }>,
): GraphAccessContext => ({
  graph: parameters.graph,
  limits: parameters.limits ?? defaultGraphAccessLimits,
  ...(parameters.session && { session: parameters.session }),
  ...(parameters.eventLogStore && { eventLogStore: parameters.eventLogStore }),
  ...(parameters.authContext && { authContext: parameters.authContext }),
});
