import {
  type PropertyValue,
  type Result,
  asEdgeId,
  asNodeId,
  asTypeId,
  err,
  ok,
} from '@canopy/graph';
import { GraphQLError } from 'graphql';
import type { ApiAdapterContext } from '../../api-context';
import { executeMutation } from '../../mutation-handlers';
import type { ApiAdapterError } from '../../result-errors';
import { createApiAdapterError } from '../../result-errors';

export interface ActorContextInput {
  readonly actingId?: string | undefined;
  readonly actorType?: 'USER' | 'AGENT' | 'PLUGIN' | 'WORKFLOW' | 'SYSTEM' | undefined;
  readonly delegationToken?: string | undefined;
}

export type ValidatedActorContext = Readonly<{
  principalId: string;
  actingId: string;
  actorType: 'USER' | 'AGENT' | 'PLUGIN' | 'WORKFLOW' | 'SYSTEM';
  approvalState: 'DIRECT_USER' | 'APPROVED' | 'SYSTEM_PERMITTED';
  delegationId?: string;
}>;

export const validateActorDelegation = (
  context: ApiAdapterContext,
  actorInput?: ActorContextInput,
): Result<ValidatedActorContext, ApiAdapterError> => {
  const principalId = context.authContext?.userId ?? 'user:default';

  if (!actorInput || !actorInput.actorType || actorInput.actorType === 'USER') {
    return ok({
      principalId,
      actingId: principalId,
      actorType: 'USER',
      approvalState: 'DIRECT_USER',
    });
  }

  if (actorInput.actorType === 'AGENT' || actorInput.actorType === 'PLUGIN') {
    if (!actorInput.delegationToken || actorInput.delegationToken === 'invalid') {
      return err(
        createApiAdapterError('UNAUTHORIZED', 'Agent execution requires a valid delegation token', {
          code: 'AGENT_APPROVAL_REQUIRED',
          actorType: actorInput.actorType,
          actingId: actorInput.actingId ?? 'agent:unknown',
        }),
      );
    }

    return ok({
      principalId,
      actingId: actorInput.actingId ?? 'agent:authenticated',
      actorType: actorInput.actorType,
      delegationId: `delegation:${actorInput.delegationToken}`,
      approvalState: 'APPROVED',
    });
  }

  return ok({
    principalId,
    actingId: actorInput.actingId ?? 'system:kernel',
    actorType: actorInput.actorType,
    approvalState: 'SYSTEM_PERMITTED',
  });
};

const resolveCreateNode = async (
  context: ApiAdapterContext,
  arguments_: Readonly<{
    input: Readonly<{
      id?: string | undefined;
      type: string;
      properties: Readonly<Record<string, PropertyValue>>;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorResult = validateActorDelegation(context, arguments_.actor);
  if (!actorResult.ok) {
    throw new GraphQLError(actorResult.error.message, {
      extensions: {
        code: 'AGENT_APPROVAL_REQUIRED',
        ...(typeof actorResult.error.details === 'object' &&
          actorResult.error.details !== null &&
          actorResult.error.details),
      },
    });
  }
  const actorContext = actorResult.value;
  const result = await executeMutation.createNode(context, {
    ...(typeof arguments_.input.id === 'string' && { id: asNodeId(arguments_.input.id) }),
    type: asTypeId(arguments_.input.type),
    properties: arguments_.input.properties,
    ...(typeof arguments_.input.expectedSequence === 'number' && {
      expectedSequence: arguments_.input.expectedSequence,
    }),
  });

  if (!result.ok) {
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
  arguments_: Readonly<{
    input: Readonly<{
      id: string;
      properties: Readonly<Record<string, PropertyValue>>;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorResult = validateActorDelegation(context, arguments_.actor);
  if (!actorResult.ok) {
    throw new GraphQLError(actorResult.error.message, {
      extensions: {
        code: 'AGENT_APPROVAL_REQUIRED',
        ...(typeof actorResult.error.details === 'object' &&
          actorResult.error.details !== null &&
          actorResult.error.details),
      },
    });
  }
  const actorContext = actorResult.value;
  const result = await executeMutation.updateNodeProperties(context, {
    id: asNodeId(arguments_.input.id),
    properties: arguments_.input.properties,
    ...(typeof arguments_.input.expectedSequence === 'number' && {
      expectedSequence: arguments_.input.expectedSequence,
    }),
  });

  if (!result.ok) {
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
  arguments_: Readonly<{
    input: Readonly<{
      id: string;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorResult = validateActorDelegation(context, arguments_.actor);
  if (!actorResult.ok) {
    throw new GraphQLError(actorResult.error.message, {
      extensions: {
        code: 'AGENT_APPROVAL_REQUIRED',
        ...(typeof actorResult.error.details === 'object' &&
          actorResult.error.details !== null &&
          actorResult.error.details),
      },
    });
  }
  const actorContext = actorResult.value;
  const result = await executeMutation.deleteNode(context, {
    id: asNodeId(arguments_.input.id),
    ...(typeof arguments_.input.expectedSequence === 'number' && {
      expectedSequence: arguments_.input.expectedSequence,
    }),
  });

  if (!result.ok) {
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
  arguments_: Readonly<{
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
  const actorResult = validateActorDelegation(context, arguments_.actor);
  if (!actorResult.ok) {
    throw new GraphQLError(actorResult.error.message, {
      extensions: {
        code: 'AGENT_APPROVAL_REQUIRED',
        ...(typeof actorResult.error.details === 'object' &&
          actorResult.error.details !== null &&
          actorResult.error.details),
      },
    });
  }
  const actorContext = actorResult.value;
  const result = await executeMutation.createEdge(context, {
    ...(typeof arguments_.input.id === 'string' && { id: asEdgeId(arguments_.input.id) }),
    type: asTypeId(arguments_.input.type),
    source: asNodeId(arguments_.input.source),
    target: asNodeId(arguments_.input.target),
    ...(arguments_.input.properties && { properties: arguments_.input.properties }),
    ...(typeof arguments_.input.expectedSequence === 'number' && {
      expectedSequence: arguments_.input.expectedSequence,
    }),
  });

  if (!result.ok) {
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
  arguments_: Readonly<{
    input: Readonly<{
      id: string;
      expectedSequence?: number | undefined;
    }>;
    actor?: ActorContextInput | undefined;
  }>,
) => {
  const actorResult = validateActorDelegation(context, arguments_.actor);
  if (!actorResult.ok) {
    throw new GraphQLError(actorResult.error.message, {
      extensions: {
        code: 'AGENT_APPROVAL_REQUIRED',
        ...(typeof actorResult.error.details === 'object' &&
          actorResult.error.details !== null &&
          actorResult.error.details),
      },
    });
  }
  const actorContext = actorResult.value;
  const result = await executeMutation.deleteEdge(context, {
    id: asEdgeId(arguments_.input.id),
    ...(typeof arguments_.input.expectedSequence === 'number' && {
      expectedSequence: arguments_.input.expectedSequence,
    }),
  });

  if (!result.ok) {
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
  createNode: (_parent: unknown, arguments_: Parameters<typeof resolveCreateNode>[1]) =>
    resolveCreateNode(context, arguments_),
  updateNodeProperties: (
    _parent: unknown,
    arguments_: Parameters<typeof resolveUpdateNodeProperties>[1],
  ) => resolveUpdateNodeProperties(context, arguments_),
  deleteNode: (_parent: unknown, arguments_: Parameters<typeof resolveDeleteNode>[1]) =>
    resolveDeleteNode(context, arguments_),
  createEdge: (_parent: unknown, arguments_: Parameters<typeof resolveCreateEdge>[1]) =>
    resolveCreateEdge(context, arguments_),
  deleteEdge: (_parent: unknown, arguments_: Parameters<typeof resolveDeleteEdge>[1]) =>
    resolveDeleteEdge(context, arguments_),
});
