import { type PropertyValue, asEdgeId, asNodeId, asTypeId } from '@canopy/graph';
import { GraphQLError } from 'graphql';
import type { ApiAdapterContext } from '../../api-context';
import { executeMutation } from '../../mutation-handlers';

export interface ActorContextInput {
  readonly actingId?: string | undefined;
  readonly actorType?: 'USER' | 'AGENT' | 'PLUGIN' | 'WORKFLOW' | 'SYSTEM' | undefined;
  readonly delegationToken?: string | undefined;
}

export const validateActorDelegation = (
  context: ApiAdapterContext,
  actorInput?: ActorContextInput,
) => {
  const principalId = context.authContext?.userId ?? 'user:default';

  if (!actorInput || !actorInput.actorType || actorInput.actorType === 'USER') {
    return {
      principalId,
      actingId: principalId,
      actorType: 'USER' as const,
      approvalState: 'DIRECT_USER' as const,
    };
  }

  if (actorInput.actorType === 'AGENT' || actorInput.actorType === 'PLUGIN') {
    if (!actorInput.delegationToken || actorInput.delegationToken === 'invalid') {
      // eslint-disable-next-line functional/no-throw-statements -- GraphQL resolvers throw GraphQLError on authorization failure
      throw new GraphQLError('Agent execution requires a valid delegation token', {
        extensions: {
          code: 'AGENT_APPROVAL_REQUIRED',
          actorType: actorInput.actorType,
          actingId: actorInput.actingId ?? 'agent:unknown',
        },
      });
    }

    return {
      principalId,
      actingId: actorInput.actingId ?? 'agent:authenticated',
      actorType: actorInput.actorType,
      delegationId: `delegation:${actorInput.delegationToken}`,
      approvalState: 'APPROVED' as const,
    };
  }

  return {
    principalId,
    actingId: actorInput.actingId ?? 'system:kernel',
    actorType: actorInput.actorType,
    approvalState: 'SYSTEM_PERMITTED' as const,
  };
};

const resolveCreateNode = async (
  context: ApiAdapterContext,
  args: Readonly<{
    input: Readonly<{
      id?: string | undefined;
      type: string;
      properties: Readonly<Record<string, PropertyValue>>;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorContext = validateActorDelegation(context, args.actor);
  const result = await executeMutation.createNode(context, {
    ...(typeof args.input.id === 'string' ? { id: asNodeId(args.input.id) } : undefined),
    type: asTypeId(args.input.type),
    properties: args.input.properties,
    ...(typeof args.input.expectedSequence === 'number'
      ? { expectedSequence: args.input.expectedSequence }
      : undefined),
  });

  if (result.ok === false) {
    throw new GraphQLError(result.error.message, {
      extensions: { code: result.error.code, details: result.error.details },
    });
  }

  return {
    id: result.value.id,
    success: result.value.success,
    affectedEventsCount: result.value.affectedEventsCount,
    actorContext,
  };
};

const resolveUpdateNodeProperties = async (
  context: ApiAdapterContext,
  args: Readonly<{
    input: Readonly<{
      id: string;
      properties: Readonly<Record<string, PropertyValue>>;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorContext = validateActorDelegation(context, args.actor);
  const result = await executeMutation.updateNodeProperties(context, {
    id: asNodeId(args.input.id),
    properties: args.input.properties,
    ...(typeof args.input.expectedSequence === 'number'
      ? { expectedSequence: args.input.expectedSequence }
      : undefined),
  });

  if (result.ok === false) {
    throw new GraphQLError(result.error.message, {
      extensions: { code: result.error.code, details: result.error.details },
    });
  }

  return {
    id: result.value.id,
    success: result.value.success,
    affectedEventsCount: result.value.affectedEventsCount,
    actorContext,
  };
};

const resolveDeleteNode = async (
  context: ApiAdapterContext,
  args: Readonly<{
    input: Readonly<{
      id: string;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorContext = validateActorDelegation(context, args.actor);
  const result = await executeMutation.deleteNode(context, {
    id: asNodeId(args.input.id),
    ...(typeof args.input.expectedSequence === 'number'
      ? { expectedSequence: args.input.expectedSequence }
      : undefined),
  });

  if (result.ok === false) {
    throw new GraphQLError(result.error.message, {
      extensions: { code: result.error.code, details: result.error.details },
    });
  }

  return {
    id: result.value.id,
    success: result.value.success,
    affectedEventsCount: result.value.affectedEventsCount,
    actorContext,
  };
};

const resolveCreateEdge = async (
  context: ApiAdapterContext,
  args: Readonly<{
    input: Readonly<{
      id?: string | undefined;
      type: string;
      source: string;
      target: string;
      properties?: Readonly<Record<string, PropertyValue>> | undefined;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorContext = validateActorDelegation(context, args.actor);
  const result = await executeMutation.createEdge(context, {
    ...(typeof args.input.id === 'string' ? { id: asEdgeId(args.input.id) } : undefined),
    type: asTypeId(args.input.type),
    source: asNodeId(args.input.source),
    target: asNodeId(args.input.target),
    ...(args.input.properties ? { properties: args.input.properties } : undefined),
    ...(typeof args.input.expectedSequence === 'number'
      ? { expectedSequence: args.input.expectedSequence }
      : undefined),
  });

  if (result.ok === false) {
    throw new GraphQLError(result.error.message, {
      extensions: { code: result.error.code, details: result.error.details },
    });
  }

  return {
    id: result.value.id,
    success: result.value.success,
    affectedEventsCount: result.value.affectedEventsCount,
    actorContext,
  };
};

const resolveDeleteEdge = async (
  context: ApiAdapterContext,
  args: Readonly<{
    input: Readonly<{
      id: string;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorContext = validateActorDelegation(context, args.actor);
  const result = await executeMutation.deleteEdge(context, {
    id: asEdgeId(args.input.id),
    ...(typeof args.input.expectedSequence === 'number'
      ? { expectedSequence: args.input.expectedSequence }
      : undefined),
  });

  if (result.ok === false) {
    throw new GraphQLError(result.error.message, {
      extensions: { code: result.error.code, details: result.error.details },
    });
  }

  return {
    id: result.value.id,
    success: result.value.success,
    affectedEventsCount: result.value.affectedEventsCount,
    actorContext,
  };
};

export const createMutationResolvers = (context: ApiAdapterContext) => ({
  createNode: (_parent: unknown, args: Parameters<typeof resolveCreateNode>[1]) =>
    resolveCreateNode(context, args),
  updateNodeProperties: (
    _parent: unknown,
    args: Parameters<typeof resolveUpdateNodeProperties>[1],
  ) => resolveUpdateNodeProperties(context, args),
  deleteNode: (_parent: unknown, args: Parameters<typeof resolveDeleteNode>[1]) =>
    resolveDeleteNode(context, args),
  createEdge: (_parent: unknown, args: Parameters<typeof resolveCreateEdge>[1]) =>
    resolveCreateEdge(context, args),
  deleteEdge: (_parent: unknown, args: Parameters<typeof resolveDeleteEdge>[1]) =>
    resolveDeleteEdge(context, args),
});
