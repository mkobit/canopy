import type { IpcClient, IpcClientError, JsonRpcId, JsonRpcResponse } from '@canopy/api-adapter';
import {
  CreateNodeParamsSchema,
  DraftApplyParamsSchema,
  DraftCommitParamsSchema,
  DraftDiscardParamsSchema,
  DraftPreviewParamsSchema,
  GetNodesParamsSchema,
  HandshakeParamsSchema,
  IPC_METHODS,
  JSON_RPC_ERROR_CODES,
  makeIpcClient,
} from '@canopy/api-adapter';
import type { TypeId } from '@canopy/graph';
import { Effect, Ref } from 'effect';
import {
  checkCreateNodeParameters,
  checkDraftApplyParameters,
  isAllowedMethod,
  needsNamespaceCheck,
} from './allowlist';
import { ensureWebClipType, toWireEvent } from './ensure-webclip-type';
import type { RateLimiter } from './rate-limiter';

// Reserved JSON-RPC "server error" range (-32000 to -32099, per spec);
// CANOPY_DOMAIN_ERROR already claims -32000, so the host's own rejections
// use distinct codes in the same range.
export const CLIP_HOST_ERROR_CODES = {
  METHOD_NOT_ALLOWED: -32_001,
  NAMESPACE_REJECTED: -32_002,
  RATE_LIMITED: -32_003,
  DAEMON_UNAVAILABLE: -32_004,
} as const;

export type IncomingRequest = Readonly<{
  method?: unknown;
  params?: unknown;
  id?: JsonRpcId;
}>;

export type ClipHost = Readonly<{
  handleRequest: (request: IncomingRequest) => Promise<JsonRpcResponse>;
}>;

export type ClipHostOptions = Readonly<{
  socketPath: string;
  rateLimiter: RateLimiter;
}> &
  Readonly<{
    /**
  Overridable for tests; defaults to the real makeIpcClient.
  */
    connect?: (socketPath: string) => Effect.Effect<IpcClient, IpcClientError>;
  }>;

const makeErrorResponse = (
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message, ...(data !== undefined && { data }) },
});

const makeSuccessResponse = (id: JsonRpcId | undefined, result: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  id: id ?? null,
  result,
});

/**
Dispatches an allowlisted method to the corresponding typed IpcClient call,
validating `params` against the same zod schema the daemon itself uses
(rather than a raw `as` cast) before crossing into the typed client.
*/
const dispatch = (
  client: IpcClient,
  method: string,
  parameters: unknown,
): Effect.Effect<
  unknown,
  IpcClientError | Readonly<{ _tag: 'InvalidParams'; message: string }>
> => {
  switch (method) {
    case IPC_METHODS.HANDSHAKE: {
      const parsed = HandshakeParamsSchema.partial().safeParse(parameters ?? {});
      return parsed.success
        ? client.handshake(parsed.data.clientVersion)
        : Effect.fail({ _tag: 'InvalidParams', message: 'Invalid handshake params' });
    }
    case IPC_METHODS.QUERY_GET_NODES: {
      const parsed = GetNodesParamsSchema.safeParse(parameters ?? {});
      return parsed.success
        ? client.getNodes(parsed.data)
        : Effect.fail({ _tag: 'InvalidParams', message: 'Invalid query.getNodes params' });
    }
    case IPC_METHODS.MUTATION_CREATE_NODE: {
      const parsed = CreateNodeParamsSchema.safeParse(parameters);
      if (!parsed.success) {
        return Effect.fail({
          _tag: 'InvalidParams',
          message: 'Invalid mutation.createNode params',
        });
      }
      return client.createNode(parsed.data);
    }
    case IPC_METHODS.DRAFT_CREATE: {
      return client.draftCreate();
    }
    case IPC_METHODS.DRAFT_APPLY: {
      const parsed = DraftApplyParamsSchema.safeParse(parameters);
      if (!parsed.success) {
        return Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.apply params' });
      }
      // parsed.data's `events[].properties` is the zod-transformed (Map)
      // shape -- structurally still assignable to draftApply's wider input
      // type (Map | Record), so this compiles either way, but a Map
      // silently serializes to `{}` under the real client's JSON.stringify.
      // Converting back to the wire (plain-object) shape here is required,
      // not cosmetic -- see ensure-webclip-type.ts's toWireEvent, which
      // exists for exactly this trap.
      return client.draftApply({
        draftId: parsed.data.draftId,
        events: parsed.data.events.map(toWireEvent),
      });
    }
    case IPC_METHODS.DRAFT_PREVIEW: {
      const parsed = DraftPreviewParamsSchema.safeParse(parameters);
      return parsed.success
        ? client.draftPreview(parsed.data)
        : Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.preview params' });
    }
    case IPC_METHODS.DRAFT_COMMIT: {
      const parsed = DraftCommitParamsSchema.safeParse(parameters);
      return parsed.success
        ? client.draftCommit(parsed.data)
        : Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.commit params' });
    }
    case IPC_METHODS.DRAFT_DISCARD: {
      const parsed = DraftDiscardParamsSchema.safeParse(parameters);
      return parsed.success
        ? client.draftDiscard(parsed.data)
        : Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.discard params' });
    }
    default: {
      // Unreachable given isAllowedMethod already gated the caller, kept for exhaustiveness.
      return Effect.fail({
        _tag: 'InvalidParams',
        message: `Unhandled allowlisted method: ${method}`,
      });
    }
  }
};

type DaemonUnavailable = Readonly<{ _tag: 'DaemonUnavailable' }>;

type HostSession = Readonly<{
  connection: Ref.Ref<IpcClient | undefined>;
  webClipTypeId: Ref.Ref<TypeId | undefined>;
}>;

const getConnection = (
  options: ClipHostOptions,
  session: HostSession,
): Effect.Effect<IpcClient, DaemonUnavailable> =>
  Effect.gen(function* () {
    const connection = yield* Ref.get(session.connection);
    if (connection) return connection;
    // Capture both typed connection errors and defects from the Unix-socket API.
    const exit = yield* Effect.exit((options.connect ?? makeIpcClient)(options.socketPath));
    if (exit._tag === 'Failure') {
      return yield* Effect.fail({ _tag: 'DaemonUnavailable' as const });
    }
    yield* Ref.set(session.connection, exit.value);
    return exit.value;
  });

const getWebClipTypeId = (
  client: IpcClient,
  session: HostSession,
): Effect.Effect<TypeId, DaemonUnavailable> =>
  Effect.gen(function* () {
    const typeId = yield* Ref.get(session.webClipTypeId);
    if (typeId) return typeId;
    const exit = yield* Effect.exit(ensureWebClipType(client));
    if (exit._tag === 'Failure') {
      return yield* Effect.fail({ _tag: 'DaemonUnavailable' as const });
    }
    yield* Ref.set(session.webClipTypeId, exit.value.typeId);
    return exit.value.typeId;
  });

const checkNamespace = (
  client: IpcClient,
  session: HostSession,
  request: IncomingRequest,
): Effect.Effect<JsonRpcResponse | undefined> =>
  Effect.gen(function* () {
    const typeIdResult = yield* Effect.result(getWebClipTypeId(client, session));
    if (typeIdResult._tag === 'Failure') {
      return makeErrorResponse(
        request.id,
        CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE,
        'daemon unavailable: could not ensure the WebClip type',
      );
    }
    const typeId = typeIdResult.success;
    const check =
      request.method === IPC_METHODS.MUTATION_CREATE_NODE
        ? checkCreateNodeParameters(request.params, typeId)
        : checkDraftApplyParameters(request.params, typeId);
    // Return the resolved identity so a denied caller can retry the same draft.
    return check.ok
      ? undefined
      : makeErrorResponse(
          request.id,
          CLIP_HOST_ERROR_CODES.NAMESPACE_REJECTED,
          check.error.message,
          { webClipTypeId: typeId },
        );
  });

const relayRequest = (
  client: IpcClient,
  method: string,
  request: IncomingRequest,
): Effect.Effect<JsonRpcResponse> =>
  Effect.gen(function* () {
    const result = yield* Effect.result(dispatch(client, method, request.params));
    if (result._tag === 'Failure') {
      const failure = result.failure;
      const code =
        failure._tag === 'IpcClientError' ? failure.code : JSON_RPC_ERROR_CODES.INVALID_PARAMS;
      // Preserve daemon error data for retry (for example parent revision).
      const data = failure._tag === 'IpcClientError' ? failure.details : undefined;
      return makeErrorResponse(request.id, code, failure.message, data);
    }
    return makeSuccessResponse(request.id, result.success);
  });

const handleRequest = (
  options: ClipHostOptions,
  session: HostSession,
  request: IncomingRequest,
): Effect.Effect<JsonRpcResponse> =>
  Effect.gen(function* () {
    const { method, id } = request;
    if (typeof method !== 'string' || !isAllowedMethod(method)) {
      return makeErrorResponse(
        id,
        CLIP_HOST_ERROR_CODES.METHOD_NOT_ALLOWED,
        `Method not allowed: ${String(method)}`,
      );
    }
    if (!options.rateLimiter.tryAcquire()) {
      return makeErrorResponse(id, CLIP_HOST_ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded');
    }
    const connectionResult = yield* Effect.result(getConnection(options, session));
    if (connectionResult._tag === 'Failure') {
      return makeErrorResponse(
        id,
        CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE,
        'daemon unavailable: could not connect to the Canopy daemon',
      );
    }
    const client = connectionResult.success;
    if (needsNamespaceCheck(method)) {
      const rejection = yield* checkNamespace(client, session, request);
      if (rejection) return rejection;
    }
    return yield* relayRequest(client, method, request);
  });

/**
Creates isolated success-only connection/type state. Reads happen lazily per
request; concurrent cold requests remain independent and failures stay retryable.
*/
export const createClipHost = (options: ClipHostOptions): ClipHost => {
  const session: HostSession = {
    connection: Ref.makeUnsafe<IpcClient | undefined>(undefined),
    webClipTypeId: Ref.makeUnsafe<TypeId | undefined>(undefined),
  };
  return {
    handleRequest: (request) => Effect.runPromise(handleRequest(options, session, request)),
  };
};
