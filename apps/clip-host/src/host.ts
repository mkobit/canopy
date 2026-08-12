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
import { Effect } from 'effect';
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

// eslint-disable-next-line functional/no-mixed-types -- config data (socketPath, rateLimiter) plus an injectable connect function for tests
export type ClipHostOptions = Readonly<{
  socketPath: string;
  rateLimiter: RateLimiter;
  /** Overridable for tests; defaults to the real makeIpcClient. */
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
 * Dispatches an allowlisted method to the corresponding typed IpcClient call,
 * validating `params` against the same zod schema the daemon itself uses
 * (rather than a raw `as` cast) before crossing into the typed client.
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
      if (!parsed.success)
        return Effect.fail({ _tag: 'InvalidParams', message: 'Invalid handshake params' });
      return client.handshake(parsed.data.clientVersion);
    }
    case IPC_METHODS.QUERY_GET_NODES: {
      const parsed = GetNodesParamsSchema.safeParse(parameters ?? {});
      if (!parsed.success) {
        return Effect.fail({ _tag: 'InvalidParams', message: 'Invalid query.getNodes params' });
      }
      return client.getNodes(parsed.data);
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
      if (!parsed.success) {
        return Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.preview params' });
      }
      return client.draftPreview(parsed.data);
    }
    case IPC_METHODS.DRAFT_COMMIT: {
      const parsed = DraftCommitParamsSchema.safeParse(parameters);
      if (!parsed.success) {
        return Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.commit params' });
      }
      return client.draftCommit(parsed.data);
    }
    case IPC_METHODS.DRAFT_DISCARD: {
      const parsed = DraftDiscardParamsSchema.safeParse(parameters);
      if (!parsed.success) {
        return Effect.fail({ _tag: 'InvalidParams', message: 'Invalid draft.discard params' });
      }
      return client.draftDiscard(parsed.data);
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

/**
 * Creates a clip-host session: lazily opens (and reuses) one long-lived
 * IpcClient connection to the daemon, lazily ensures the WebClip type on
 * first use, and enforces the method allowlist, namespace narrowing, and
 * rate limit on every incoming request before relaying to the daemon.
 */
// eslint-disable-next-line max-lines-per-function -- lazily-established connection/type-id state plus the sequential allowlist/rate-limit/connect/namespace/dispatch gate, mirrors ipc-handlers.ts's per-method dispatch
export const createClipHost = (options: ClipHostOptions): ClipHost => {
  const connect = options.connect ?? makeIpcClient;
  // eslint-disable-next-line functional/no-let -- lazily-established, reused connection, mirroring IpcClient's own closure-based state
  let connection: IpcClient | undefined;
  // eslint-disable-next-line functional/no-let -- resolved once, reused across requests
  let webClipTypeId: TypeId | undefined;

  const getConnection = (): Effect.Effect<IpcClient, Readonly<{ _tag: 'DaemonUnavailable' }>> =>
    Effect.gen(function* () {
      if (connection) return connection;
      // Effect.exit rather than Effect.either: connecting to a missing Unix
      // socket path can surface as a synchronous throw (a defect) rather
      // than a typed IpcClientError -- see node:net's ENOENT behavior for a
      // nonexistent socket path. Effect.exit captures defects too, so a
      // missing daemon can't escape as an unhandled rejection.
      const exit = yield* Effect.exit(connect(options.socketPath));
      if (exit._tag === 'Failure') {
        return yield* Effect.fail({ _tag: 'DaemonUnavailable' as const });
      }

      connection = exit.value;
      return connection;
    });

  const getWebClipTypeId = (
    client: IpcClient,
  ): Effect.Effect<TypeId, Readonly<{ _tag: 'DaemonUnavailable' }>> =>
    Effect.gen(function* () {
      if (webClipTypeId) return webClipTypeId;
      const exit = yield* Effect.exit(ensureWebClipType(client));
      if (exit._tag === 'Failure') {
        return yield* Effect.fail({ _tag: 'DaemonUnavailable' as const });
      }

      webClipTypeId = exit.value.typeId;
      return webClipTypeId;
    });

  const handleRequest = (request: IncomingRequest): Promise<JsonRpcResponse> => {
    const { method, params, id } = request;

    const program = Effect.gen(function* () {
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

      const connectionResult = yield* Effect.either(getConnection());
      if (connectionResult._tag === 'Left') {
        return makeErrorResponse(
          id,
          CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE,
          'daemon unavailable: could not connect to the Canopy daemon',
        );
      }
      const client = connectionResult.right;

      if (needsNamespaceCheck(method)) {
        const typeIdResult = yield* Effect.either(getWebClipTypeId(client));
        if (typeIdResult._tag === 'Left') {
          return makeErrorResponse(
            id,
            CLIP_HOST_ERROR_CODES.DAEMON_UNAVAILABLE,
            'daemon unavailable: could not ensure the WebClip type',
          );
        }
        const typeId = typeIdResult.right;
        const check =
          method === IPC_METHODS.MUTATION_CREATE_NODE
            ? checkCreateNodeParameters(params, typeId)
            : checkDraftApplyParameters(params, typeId);
        if (!check.ok) {
          // Callers that don't yet know the ensured WebClip type id (e.g. a
          // first-ever clip) can't pre-construct a matching event; surfacing
          // the resolved id here (already ensured by getWebClipTypeId above)
          // lets them retry the same request -- same open draftId for
          // draft.apply -- with the correct nodeType instead of guessing.
          return makeErrorResponse(
            id,
            CLIP_HOST_ERROR_CODES.NAMESPACE_REJECTED,
            check.error.message,
            { webClipTypeId: typeId },
          );
        }
      }

      const dispatchResult = yield* Effect.either(dispatch(client, method, params));
      if (dispatchResult._tag === 'Left') {
        const failure = dispatchResult.left;
        const code =
          failure._tag === 'IpcClientError' ? failure.code : JSON_RPC_ERROR_CODES.INVALID_PARAMS;
        // The daemon's own error `data` (e.g. concurrent-modification's
        // currentParentRevision) is preserved on IpcClientError.details --
        // forwarding it is required for callers to retry, not cosmetic; see
        // tasks.md 6.5's re-preview/retry flow.
        const data = failure._tag === 'IpcClientError' ? failure.details : undefined;
        return makeErrorResponse(id, code, failure.message, data);
      }

      return makeSuccessResponse(id, dispatchResult.right);
    });

    return Effect.runPromise(program);
  };

  return { handleRequest };
};
