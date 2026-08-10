/* eslint-disable max-lines-per-function, functional/prefer-immutable-types */
import type { DraftError, DraftSession, Graph, PropertyValue, Result } from '@canopy/graph';
import { asEdgeId, asNodeId, asTypeId, createDraftSession, ok } from '@canopy/graph';
import { Temporal } from 'temporal-polyfill';
import type { ApiAdapterContext } from '../api-context';
import { createApiRequest } from '../api-payloads';
import type { EventStreamSubscription } from '../event-stream-handlers';
import { createEventStreamSubscriber } from '../event-stream-handlers';
import {
  executeCreateEdge,
  executeCreateNode,
  executeDeleteEdge,
  executeDeleteNode,
  executeUpdateNodeProperties,
} from '../mutation-handlers';
import { executeEdgeQuery, executeNodeQuery } from '../query-handlers';
import type {
  DraftApplyResult,
  DraftCreateResult,
  DraftPreviewResult,
  HandshakeResult,
  IpcProtocolError,
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
  SubscribeResult,
  UnsubscribeResult,
} from './ipc-schema';
import {
  CreateEdgeParamsSchema as CreateEdgeParametersSchema,
  CreateNodeParamsSchema as CreateNodeParametersSchema,
  DeleteEdgeParamsSchema as DeleteEdgeParametersSchema,
  DeleteNodeParamsSchema as DeleteNodeParametersSchema,
  DraftApplyParamsSchema as DraftApplyParametersSchema,
  DraftCommitParamsSchema as DraftCommitParametersSchema,
  DraftCreateParamsSchema as DraftCreateParametersSchema,
  DraftDiscardParamsSchema as DraftDiscardParametersSchema,
  DraftPreviewParamsSchema as DraftPreviewParametersSchema,
  ExecuteQueryParamsSchema as ExecuteQueryParametersSchema,
  GetEdgeParamsSchema as GetEdgeParametersSchema,
  GetEdgesParamsSchema as GetEdgesParametersSchema,
  GetNodeParamsSchema as GetNodeParametersSchema,
  GetNodesParamsSchema as GetNodesParametersSchema,
  HandshakeParamsSchema as HandshakeParametersSchema,
  IPC_METHODS,
  JSON_RPC_ERROR_CODES,
  JsonRpcRequestSchema,
  SubscribeParamsSchema as SubscribeParametersSchema,
  UnsubscribeParamsSchema as UnsubscribeParametersSchema,
  UpdateNodePropertiesParamsSchema as UpdateNodePropertiesParametersSchema,
} from './ipc-schema';

// A per-connection draft registry entry. ipc-server.ts owns the socket-keyed map of these;
// ipc-handlers.ts only ever reads it and reports mutations back via IpcHandlerResponse signals.
export type DraftRegistryEntry = Readonly<{
  session: DraftSession;
  lastTouchedAt: number;
  // Cumulative count of events staged across all draft.apply calls on this draft. Tracked here
  // (rather than asking DraftSession, which does not expose it) so draft.apply can enforce
  // MAX_STAGED_EVENTS_PER_DRAFT as a running total, not just a per-call batch size.
  stagedEventCount: number;
}>;

export type IpcHandlerResponse = Readonly<{
  response?: JsonRpcResponse | undefined;
  newSubscription?:
    | Readonly<{
        subscriptionId: string;
        subscriber: EventStreamSubscription;
      }>
    | undefined;
  unsubscribeId?: string | undefined;
  // A newly created draft for ipc-server.ts to register under draftId.
  newDraft?: Readonly<{ draftId: string; entry: DraftRegistryEntry }> | undefined;
  // Draft ids ipc-server.ts should remove from its registry (explicit commit/discard success, or
  // lazy idle-TTL eviction discovered while handling this request).
  dropDraftIds?: readonly string[] | undefined;
  // A draft whose registry entry ipc-server.ts should refresh: lastTouchedAt is always bumped to
  // "now"; stagedEventCount is overwritten only when provided (a successful draft.apply).
  touchDraft?: Readonly<{ draftId: string; stagedEventCount?: number }> | undefined;
}>;

// Bounded limits for the ephemeral, connection-scoped draft registry (design.md "Preview state as a
// DoS vector" mitigation). Same-user trust boundary makes a runaway agent self-DoS rather than
// cross-tenant, but the daemon still must not grow unbounded memory from abandoned/runaway drafts.
const MAX_DRAFTS_PER_CONNECTION = 10;
const MAX_DRAFTS_GLOBAL = 100;
const MAX_STAGED_EVENTS_PER_DRAFT = 500;
const MAX_PREVIEW_TOUCHED_IDS = 200;
const DRAFT_IDLE_TTL_MS = 10 * 60 * 1000; // 10 minutes of inactivity

const nowMillis = (): number => Temporal.Now.instant().epochMilliseconds;

// Lazily identifies drafts in this connection's registry that have exceeded the idle TTL. Called on
// every draft.* request rather than via a background sweep timer, per design.md's stated preference
// to avoid timer lifecycle/cleanup complexity in a request-driven server.
const collectExpiredDraftIds = (
  drafts: ReadonlyMap<string, DraftRegistryEntry>,
): readonly string[] => {
  const currentTime = nowMillis();
  return [...drafts]
    .filter(([, entry]) => currentTime - entry.lastTouchedAt > DRAFT_IDLE_TTL_MS)
    .map(([draftId]) => draftId);
};

// Maps a DraftError to a CANOPY_DOMAIN_ERROR JSON-RPC response. For concurrent-modification, enriches
// the wire-level error with the server's current parent revision (fetched separately, since
// DraftSession's DraftError carries no extra fields for that variant today) so a remote client can
// re-fetch, rebase, re-preview, and retry without reconnecting -- see design.md Decision 2.
const draftErrorResponse = (
  requestId: JsonRpcId,
  draftError: DraftError,
  draft: DraftSession,
): JsonRpcResponse => {
  if (draftError.type === 'concurrent-modification') {
    const revisionResult = draft.getParentRevision();
    return makeErrorResponse(
      requestId,
      JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
      'Draft commit failed: parent revision has advanced',
      {
        type: 'concurrent-modification',
        ...(revisionResult.ok && { currentParentRevision: revisionResult.value }),
      },
    );
  }
  const message =
    'message' in draftError ? draftError.message : `Draft operation failed: ${draftError.type}`;
  return makeErrorResponse(
    requestId,
    JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
    message,
    draftError,
  );
};

// draftId is an IPC-layer-generated identifier unknown to @canopy/graph, so "not found" is not a
// DraftError variant -- it is represented as its own IPC-only domain-error discriminant.
const draftNotFoundResponse = (requestId: JsonRpcId, draftId: string): JsonRpcResponse =>
  makeErrorResponse(
    requestId,
    JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
    `Draft not found: ${draftId}`,
    {
      type: 'draft-not-found',
    },
  );

// Mirrors mutation-handlers.ts's "GraphSession is required" guard for write mutations: every
// canopy.v1.draft.* method requires a live session (read-only contexts cannot preview or commit).
const draftSessionRequiredResponse = (requestId: JsonRpcId): JsonRpcResponse =>
  makeErrorResponse(
    requestId,
    JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
    'GraphSession is required for draft operations',
    { type: 'unauthorized' },
  );

type DraftChangeKind = 'created' | 'updated' | 'deleted';

// Diffs two id-keyed maps by reference identity. projectGraph/applyEvent (packages/graph/src/projection.ts)
// copy-on-write each Map on every event application, reusing the same object reference for every
// untouched entry -- so entries with `parentValue !== draftValue` are exactly the ones the staged
// events actually touched, with no need to deep-compare properties.
const diffEntries = (
  parentEntries: ReadonlyMap<string, unknown>,
  draftEntries: ReadonlyMap<string, unknown>,
): readonly Readonly<{ id: string; kind: DraftChangeKind }>[] => {
  const createdOrUpdated = [...draftEntries].flatMap(
    ([id, draftValue]): readonly Readonly<{ id: string; kind: DraftChangeKind }>[] => {
      const parentValue = parentEntries.get(id);
      if (parentValue === undefined) return [{ id, kind: 'created' }];
      if (parentValue !== draftValue) return [{ id, kind: 'updated' }];
      return [];
    },
  );
  const deleted: readonly Readonly<{ id: string; kind: DraftChangeKind }>[] = [
    ...parentEntries.keys(),
  ]
    .filter((id) => !draftEntries.has(id))
    .map((id) => ({ id, kind: 'deleted' as const }));
  return [...createdOrUpdated, ...deleted];
};

// Summarizes a diff list into counts plus a touched-id list capped at MAX_PREVIEW_TOUCHED_IDS, so a
// preview over a large batch never serializes an unbounded response (design.md "Unbounded preview
// payloads" mitigation).
// touchedIds intentionally returns a mutable string[] (not readonly) -- it slots directly into
// DraftPreviewResult, whose z.infer'd shape (z.array(z.string()), matching the rest of this file's
// existing schema-array fields, e.g. HandshakeResult.capabilities) is a plain mutable array.
const summarizeDraftDiff = (
  changes: readonly Readonly<{ id: string; kind: DraftChangeKind }>[],
): Readonly<{
  counts: Readonly<{ created: number; updated: number; deleted: number }>;
  touchedIds: string[];
  truncated: boolean;
}> => ({
  counts: {
    created: changes.filter((change) => change.kind === 'created').length,
    updated: changes.filter((change) => change.kind === 'updated').length,
    deleted: changes.filter((change) => change.kind === 'deleted').length,
  },
  touchedIds: changes.slice(0, MAX_PREVIEW_TOUCHED_IDS).map((change) => change.id),
  truncated: changes.length > MAX_PREVIEW_TOUCHED_IDS,
});

// Computes the bounded draft.preview summary from the parent graph vs. the draft's combined overlay
// projection. Never serializes the full graph -- only counts plus capped touched-id lists.
const computeDraftPreview = (
  parentGraph: Graph,
  draftGraph: Graph,
): Readonly<{
  counts: Readonly<{ created: number; updated: number; deleted: number }>;
  touchedNodeIds: string[];
  touchedEdgeIds: string[];
  truncated: boolean;
}> => {
  const nodeSummary = summarizeDraftDiff(diffEntries(parentGraph.nodes, draftGraph.nodes));
  const edgeSummary = summarizeDraftDiff(diffEntries(parentGraph.edges, draftGraph.edges));
  return {
    counts: {
      created: nodeSummary.counts.created + edgeSummary.counts.created,
      updated: nodeSummary.counts.updated + edgeSummary.counts.updated,
      deleted: nodeSummary.counts.deleted + edgeSummary.counts.deleted,
    },
    touchedNodeIds: nodeSummary.touchedIds,
    touchedEdgeIds: edgeSummary.touchedIds,
    truncated: nodeSummary.truncated || edgeSummary.truncated,
  };
};

// Creates a JSON-RPC error response object.
const makeErrorResponse = (
  id: JsonRpcId | undefined,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({
  jsonrpc: '2.0',
  error: {
    code,
    message,
    ...(data !== undefined && { data }),
  },
  id: id ?? null,
});

// Creates a JSON-RPC success response object.
const makeSuccessResponse = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({
  jsonrpc: '2.0',
  result,
  id,
});

// Handles incoming JSON-RPC request line and dispatches to appropriate Canopy API handlers.
// `drafts` is this connection's current draft registry (ipc-server.ts owns the socket-keyed map and
// all writes to it; this function only reads and returns signals -- newDraft/dropDraftIds/touchDraftId
// -- for the caller to apply). `globalDraftCount` is the live total across all connections, used only
// to enforce the global concurrent-draft cap on draft.create.
export const handleIpcRequestLine = async (
  line: string,
  context: ApiAdapterContext,
  drafts: ReadonlyMap<string, DraftRegistryEntry> = new Map(),
  globalDraftCount = 0,
): Promise<Result<IpcHandlerResponse, IpcProtocolError>> => {
  // eslint-disable-next-line functional/no-let
  let currentId: JsonRpcId | undefined;

  // eslint-disable-next-line functional/no-try-statements
  try {
    const rawObject: unknown = JSON.parse(line);
    if (typeof rawObject === 'object' && rawObject !== null && 'id' in rawObject) {
      currentId = (rawObject as Readonly<{ id?: JsonRpcId }>).id;
    }

    const parseResult = JsonRpcRequestSchema.safeParse(rawObject);
    if (!parseResult.success) {
      return ok({
        response: makeErrorResponse(
          currentId,
          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
          'Invalid JSON-RPC 2.0 request payload',
          parseResult.error.format(),
        ),
      });
    }

    const request: JsonRpcRequest = parseResult.data;
    const requestId = request.id ?? null;
    currentId = requestId;

    switch (request.method) {
      case IPC_METHODS.HANDSHAKE: {
        const parametersResult = HandshakeParametersSchema.safeParse(request.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid handshake parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const handshakeResult: HandshakeResult = {
          apiVersion: 'v1',
          serverVersion: '0.1.0',
          capabilities: ['queries', 'mutations', 'subscriptions', 'drafts'],
        };
        return ok({ response: makeSuccessResponse(requestId, handshakeResult) });
      }

      case IPC_METHODS.QUERY_GET_NODE: {
        const parametersResult = GetNodeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getNode parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = executeNodeQuery(
          createApiRequest('ipc-get-node', context, { id: asNodeId(parametersResult.data.id) }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        const node = result.value[0];
        if (!node) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `Node not found: ${parametersResult.data.id}`,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, node) });
      }

      case IPC_METHODS.QUERY_GET_NODES: {
        const parametersResult = GetNodesParametersSchema.safeParse(request.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getNodes parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = executeNodeQuery(
          createApiRequest('ipc-get-nodes', context, {
            type: parametersResult.data.type ? asTypeId(parametersResult.data.type) : undefined,
            limit: parametersResult.data.limit,
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.QUERY_GET_EDGE: {
        const parametersResult = GetEdgeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getEdge parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = executeEdgeQuery(
          createApiRequest('ipc-get-edge', context, { id: asEdgeId(parametersResult.data.id) }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        const edge = result.value[0];
        if (!edge) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `Edge not found: ${parametersResult.data.id}`,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, edge) });
      }

      case IPC_METHODS.QUERY_GET_EDGES: {
        const parametersResult = GetEdgesParametersSchema.safeParse(request.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getEdges parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = executeEdgeQuery(
          createApiRequest('ipc-get-edges', context, {
            type: parametersResult.data.type ? asTypeId(parametersResult.data.type) : undefined,
            source: parametersResult.data.source
              ? asNodeId(parametersResult.data.source)
              : undefined,
            target: parametersResult.data.target
              ? asNodeId(parametersResult.data.target)
              : undefined,
            direction: parametersResult.data.direction,
            limit: parametersResult.data.limit,
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.QUERY_EXECUTE_QUERY: {
        const parametersResult = ExecuteQueryParametersSchema.safeParse(request.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid executeQuery parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = executeNodeQuery(
          createApiRequest('ipc-execute-query', context, {
            type: undefined,
            limit: undefined,
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.MUTATION_CREATE_NODE: {
        const parametersResult = CreateNodeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid createNode parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = await executeCreateNode(
          createApiRequest('ipc-create-node', context, {
            ...(parametersResult.data.id && { id: asNodeId(parametersResult.data.id) }),
            type: asTypeId(parametersResult.data.type),
            properties: parametersResult.data.properties as Readonly<Record<string, PropertyValue>>,
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES: {
        const parametersResult = UpdateNodePropertiesParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid updateNodeProperties parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = await executeUpdateNodeProperties(
          createApiRequest('ipc-update-node-properties', context, {
            id: asNodeId(parametersResult.data.id),
            properties: parametersResult.data.properties as Readonly<Record<string, PropertyValue>>,
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.MUTATION_DELETE_NODE: {
        const parametersResult = DeleteNodeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid deleteNode parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = await executeDeleteNode(
          createApiRequest('ipc-delete-node', context, {
            id: asNodeId(parametersResult.data.id),
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.MUTATION_CREATE_EDGE: {
        const parametersResult = CreateEdgeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid createEdge parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = await executeCreateEdge(
          createApiRequest('ipc-create-edge', context, {
            ...(parametersResult.data.id && { id: asEdgeId(parametersResult.data.id) }),
            type: asTypeId(parametersResult.data.type),
            source: asNodeId(parametersResult.data.source),
            target: asNodeId(parametersResult.data.target),
            properties: (parametersResult.data.properties ?? {}) as Readonly<
              Record<string, PropertyValue>
            >,
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.MUTATION_DELETE_EDGE: {
        const parametersResult = DeleteEdgeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid deleteEdge parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const result = await executeDeleteEdge(
          createApiRequest('ipc-delete-edge', context, {
            id: asEdgeId(parametersResult.data.id),
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!result.ok) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              result.error.message,
              result.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(requestId, result.value) });
      }

      case IPC_METHODS.EVENT_STREAM_SUBSCRIBE: {
        const parametersResult = SubscribeParametersSchema.safeParse(request.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid subscribe parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const subscriptionId = `sub_${Math.random().toString(36).slice(2, 11)}`;
        const subscriber = createEventStreamSubscriber(context);
        const subscribeResult: SubscribeResult = { subscriptionId };
        return ok({
          response: makeSuccessResponse(requestId, subscribeResult),
          newSubscription: {
            subscriptionId,
            subscriber,
          },
        });
      }

      case IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE: {
        const parametersResult = UnsubscribeParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid unsubscribe parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const unsubscribeResult: UnsubscribeResult = { success: true };
        return ok({
          response: makeSuccessResponse(requestId, unsubscribeResult),
          unsubscribeId: parametersResult.data.subscriptionId,
        });
      }

      case IPC_METHODS.DRAFT_CREATE: {
        const { session } = context;
        if (!session) {
          return ok({ response: draftSessionRequiredResponse(requestId) });
        }

        const parametersResult = DraftCreateParametersSchema.safeParse(request.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid draft.create parameters',
              parametersResult.error.format(),
            ),
          });
        }

        const expiredDraftIds = collectExpiredDraftIds(drafts);
        const liveConnectionCount = drafts.size - expiredDraftIds.length;
        if (liveConnectionCount >= MAX_DRAFTS_PER_CONNECTION) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `Maximum concurrent drafts per connection (${MAX_DRAFTS_PER_CONNECTION}) reached`,
              { type: 'limit-exceeded', limit: 'per-connection' },
            ),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }
        const liveGlobalCount = globalDraftCount - expiredDraftIds.length;
        if (liveGlobalCount >= MAX_DRAFTS_GLOBAL) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `Maximum concurrent drafts across all connections (${MAX_DRAFTS_GLOBAL}) reached`,
              { type: 'limit-exceeded', limit: 'global' },
            ),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const draft = createDraftSession(session);
        const revisionResult = draft.getParentRevision();
        if (!revisionResult.ok) {
          return ok({
            response: draftErrorResponse(requestId, revisionResult.error, draft),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const draftId = `draft_${Math.random().toString(36).slice(2, 11)}`;
        const entry: DraftRegistryEntry = {
          session: draft,
          lastTouchedAt: nowMillis(),
          stagedEventCount: 0,
        };
        const createResult: DraftCreateResult = {
          draftId,
          parentRevision: revisionResult.value,
        };
        return ok({
          response: makeSuccessResponse(requestId, createResult),
          newDraft: { draftId, entry },
          ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
        });
      }

      case IPC_METHODS.DRAFT_APPLY: {
        const { session } = context;
        if (!session) {
          return ok({ response: draftSessionRequiredResponse(requestId) });
        }

        const parametersResult = DraftApplyParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid draft.apply parameters',
              parametersResult.error.format(),
            ),
          });
        }

        const expiredDraftIds = collectExpiredDraftIds(drafts);
        const { draftId, events } = parametersResult.data;
        const entry = expiredDraftIds.includes(draftId) ? undefined : drafts.get(draftId);
        if (!entry) {
          return ok({
            response: draftNotFoundResponse(requestId, draftId),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const projectedStagedCount = entry.stagedEventCount + events.length;
        if (projectedStagedCount > MAX_STAGED_EVENTS_PER_DRAFT) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `draft.apply would stage ${projectedStagedCount} events, exceeding the maximum of ${MAX_STAGED_EVENTS_PER_DRAFT} staged events per draft`,
              { type: 'limit-exceeded', limit: 'staged-events' },
            ),
            touchDraft: { draftId },
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const applyResult = entry.session.applyEvents(events);
        if (!applyResult.ok) {
          return ok({
            response: draftErrorResponse(requestId, applyResult.error, entry.session),
            touchDraft: { draftId },
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const stagedResult: DraftApplyResult = { staged: events.length };
        return ok({
          response: makeSuccessResponse(requestId, stagedResult),
          touchDraft: { draftId, stagedEventCount: projectedStagedCount },
          ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
        });
      }

      case IPC_METHODS.DRAFT_PREVIEW: {
        const { session } = context;
        if (!session) {
          return ok({ response: draftSessionRequiredResponse(requestId) });
        }

        const parametersResult = DraftPreviewParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid draft.preview parameters',
              parametersResult.error.format(),
            ),
          });
        }

        const expiredDraftIds = collectExpiredDraftIds(drafts);
        const { draftId } = parametersResult.data;
        const entry = expiredDraftIds.includes(draftId) ? undefined : drafts.get(draftId);
        if (!entry) {
          return ok({
            response: draftNotFoundResponse(requestId, draftId),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const revisionResult = entry.session.getParentRevision();
        if (!revisionResult.ok) {
          return ok({
            response: draftErrorResponse(requestId, revisionResult.error, entry.session),
            touchDraft: { draftId },
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        // draft.graph() projects the overlay; call it exactly once for this request.
        const diff = computeDraftPreview(session.graph(), entry.session.graph());
        const previewResult: DraftPreviewResult = {
          parentRevision: revisionResult.value,
          ...diff,
        };
        return ok({
          response: makeSuccessResponse(requestId, previewResult),
          touchDraft: { draftId },
          ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
        });
      }

      case IPC_METHODS.DRAFT_COMMIT: {
        const { session } = context;
        if (!session) {
          return ok({ response: draftSessionRequiredResponse(requestId) });
        }

        const parametersResult = DraftCommitParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid draft.commit parameters',
              parametersResult.error.format(),
            ),
          });
        }

        const expiredDraftIds = collectExpiredDraftIds(drafts);
        const { draftId, expectedParentRevision } = parametersResult.data;
        const entry = expiredDraftIds.includes(draftId) ? undefined : drafts.get(draftId);
        if (!entry) {
          return ok({
            response: draftNotFoundResponse(requestId, draftId),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const commitResult = await entry.session.commit(expectedParentRevision);
        if (!commitResult.ok) {
          // concurrent-modification (and any other commit failure) leaves the draft active so the
          // client can re-preview and retry without losing staged work -- see design.md Decision 2.
          return ok({
            response: draftErrorResponse(requestId, commitResult.error, entry.session),
            touchDraft: { draftId },
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        return ok({
          response: makeSuccessResponse(requestId, { success: true }),
          dropDraftIds: [draftId, ...expiredDraftIds],
        });
      }

      case IPC_METHODS.DRAFT_DISCARD: {
        const { session } = context;
        if (!session) {
          return ok({ response: draftSessionRequiredResponse(requestId) });
        }

        const parametersResult = DraftDiscardParametersSchema.safeParse(request.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              requestId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid draft.discard parameters',
              parametersResult.error.format(),
            ),
          });
        }

        const expiredDraftIds = collectExpiredDraftIds(drafts);
        const { draftId } = parametersResult.data;
        const entry = expiredDraftIds.includes(draftId) ? undefined : drafts.get(draftId);
        if (!entry) {
          return ok({
            response: draftNotFoundResponse(requestId, draftId),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        const discardResult = entry.session.discard();
        if (!discardResult.ok) {
          return ok({
            response: draftErrorResponse(requestId, discardResult.error, entry.session),
            ...(expiredDraftIds.length > 0 && { dropDraftIds: expiredDraftIds }),
          });
        }

        return ok({
          response: makeSuccessResponse(requestId, { success: true }),
          dropDraftIds: [draftId, ...expiredDraftIds],
        });
      }

      default: {
        return ok({
          response: makeErrorResponse(
            requestId,
            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
            `Method not found: ${request.method}`,
          ),
        });
      }
    }
  } catch (error) {
    return ok({
      response: makeErrorResponse(
        currentId,
        JSON_RPC_ERROR_CODES.PARSE_ERROR,
        `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      ),
    });
  }
};
