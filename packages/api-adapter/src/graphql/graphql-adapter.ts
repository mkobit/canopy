import type { EventBus } from '@canopy/graph';
import { graphql, parse, subscribe, type ExecutionResult, type GraphQLSchema } from 'graphql';
import type { ApiAdapterContext } from '../api-context';
import { createMutationResolvers } from './resolvers/mutations';
import { createQueryResolvers } from './resolvers/queries';
import {
  createSubscriptionResolvers,
  type EventStreamSubscriptionArgs,
} from './resolvers/subscriptions';
import { buildGraphQLSchema } from './schema';

export type GraphQLAdapterOptions = Readonly<{
  eventBus?: EventBus;
}>;

export type GraphQLRequest = Readonly<{
  source: string;
  variableValues?: Record<string, unknown>;
  operationName?: string;
}>;

export type GraphQLAdapterSchema = Readonly<{
  schema: GraphQLSchema;
}>;

export type GraphQLAdapterExecution = Readonly<{
  execute: (request: GraphQLRequest) => Promise<ExecutionResult>;
  subscribe: (
    request: GraphQLRequest,
  ) => Promise<AsyncIterableIterator<ExecutionResult> | ExecutionResult>;
}>;

export type GraphQLAdapter = GraphQLAdapterSchema & GraphQLAdapterExecution;

export const createGraphQLAdapter = (
  context: ApiAdapterContext,
  options?: GraphQLAdapterOptions,
): GraphQLAdapter => {
  const schema = buildGraphQLSchema();
  const queryResolvers = createQueryResolvers(context);
  const mutationResolvers = createMutationResolvers(context);
  const subscriptionResolvers = createSubscriptionResolvers(context, options?.eventBus);

  const adaptedOperations = Object.fromEntries(
    Object.entries({ ...queryResolvers, ...mutationResolvers }).map(([key, fn]) => [
      key,
      (args: unknown) => (fn as (parent: unknown, args: unknown) => unknown)(null, args),
    ]),
  );

  const rootValue = {
    ...adaptedOperations,
    eventStream: (args: unknown) =>
      subscriptionResolvers.eventStream.subscribe(null, args as EventStreamSubscriptionArgs),
  };

  return {
    schema,
    execute: async (request: GraphQLRequest): Promise<ExecutionResult> => {
      return graphql({
        schema,
        source: request.source,
        rootValue,
        variableValues: request.variableValues,
        operationName: request.operationName,
      });
    },
    subscribe: async (request: GraphQLRequest) => {
      const document = parse(request.source);
      return subscribe({
        schema,
        document,
        rootValue,
        variableValues: request.variableValues,
        operationName: request.operationName,
      });
    },
  };
};
