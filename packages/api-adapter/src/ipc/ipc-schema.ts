/* eslint-disable unicorn/name-replacements -- Params* names are consumed by apps/cli/src/ipc/ipc-client.ts and tests/ipc-schema.test.ts, outside this batch's scope */
import { z } from 'zod';
import type { Result } from '@canopy/graph';
import { GraphEventSchema } from '@canopy/graph';

// Standard JSON-RPC 2.0 error codes.
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32_700,
  INVALID_REQUEST: -32_600,
  METHOD_NOT_FOUND: -32_601,
  INVALID_PARAMS: -32_602,
  INTERNAL_ERROR: -32_603,
  CANOPY_DOMAIN_ERROR: -32_000,
} as const;

export type JsonRpcErrorCode = (typeof JSON_RPC_ERROR_CODES)[keyof typeof JSON_RPC_ERROR_CODES];

// Domain error for when the IPC socket path is already in use by another running listener.
export type IpcSocketInUseError = Readonly<{
  _tag: 'IpcSocketInUseError';
  socketPath: string;
  message: string;
}>;

// Creates an IpcSocketInUseError instance.
export const createIpcSocketInUseError = (socketPath: string): IpcSocketInUseError => ({
  _tag: 'IpcSocketInUseError',
  socketPath,
  message: `IPC socket path is already in use: ${socketPath}`,
});

// Domain error for protocol framing, deserialization, or validation errors.
export type IpcProtocolError = Readonly<{
  _tag: 'IpcProtocolError';
  code: number;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;

// Creates an IpcProtocolError instance.
export const createIpcProtocolError = (
  code: number,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): IpcProtocolError => ({
  _tag: 'IpcProtocolError',
  code,
  message,
  ...(details && { details }),
});

// Result aliases for IPC operations returning Result<T, E>.
export type IpcResult<T, E = IpcProtocolError> = Result<T, E>;

// Versioned method names for canopy.v1 namespace.
export const IPC_METHODS = {
  HANDSHAKE: 'canopy.v1.handshake',
  QUERY_GET_NODE: 'canopy.v1.query.getNode',
  QUERY_GET_NODES: 'canopy.v1.query.getNodes',
  QUERY_GET_EDGE: 'canopy.v1.query.getEdge',
  QUERY_GET_EDGES: 'canopy.v1.query.getEdges',
  QUERY_EXECUTE_QUERY: 'canopy.v1.query.executeQuery',
  MUTATION_CREATE_NODE: 'canopy.v1.mutation.createNode',
  MUTATION_UPDATE_NODE_PROPERTIES: 'canopy.v1.mutation.updateNodeProperties',
  MUTATION_DELETE_NODE: 'canopy.v1.mutation.deleteNode',
  MUTATION_CREATE_EDGE: 'canopy.v1.mutation.createEdge',
  MUTATION_DELETE_EDGE: 'canopy.v1.mutation.deleteEdge',
  EVENT_STREAM_SUBSCRIBE: 'canopy.v1.eventStream.subscribe',
  EVENT_STREAM_UNSUBSCRIBE: 'canopy.v1.eventStream.unsubscribe',
  EVENT_STREAM_EVENT: 'canopy.v1.eventStream.event',
  DRAFT_CREATE: 'canopy.v1.draft.create',
  DRAFT_APPLY: 'canopy.v1.draft.apply',
  DRAFT_PREVIEW: 'canopy.v1.draft.preview',
  DRAFT_COMMIT: 'canopy.v1.draft.commit',
  DRAFT_DISCARD: 'canopy.v1.draft.discard',
} as const;

export type IpcMethodName = (typeof IPC_METHODS)[keyof typeof IPC_METHODS];

// JSON-RPC Request ID schema (string, number, or null).
export const JsonRpcIdSchema = z.union([z.string(), z.number(), z.null()]);
export type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

// Generic JSON-RPC Request schema with passthrough for additive compatibility.
export const JsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.unknown().optional(),
    id: JsonRpcIdSchema.optional(),
  })
  .passthrough();

export type JsonRpcRequest = Readonly<{
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: JsonRpcId | undefined;
}>;

// Generic JSON-RPC Error object schema.
export const JsonRpcErrorObjectSchema = z
  .object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough();

export type JsonRpcErrorObject = Readonly<{
  code: number;
  message: string;
  data?: unknown;
}>;

// Generic JSON-RPC Response schema with passthrough.
export const JsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    result: z.unknown().optional(),
    error: JsonRpcErrorObjectSchema.optional(),
    id: JsonRpcIdSchema,
  })
  .passthrough();

export type JsonRpcResponse = Readonly<{
  jsonrpc: '2.0';
  result?: unknown;
  error?: JsonRpcErrorObject;
  id: JsonRpcId;
}>;

// Generic JSON-RPC Notification schema.
export const JsonRpcNotificationSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    method: z.string(),
    params: z.unknown().optional(),
  })
  .passthrough();

export type JsonRpcNotification = Readonly<{
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}>;

// Handshake request parameters schema.
export const HandshakeParamsSchema = z
  .object({
    clientVersion: z.string(),
    supportedCapabilities: z.array(z.string()).default([]),
  })
  .passthrough();

export type HandshakeParams = z.infer<typeof HandshakeParamsSchema>;

// Handshake result payload schema.
export const HandshakeResultSchema = z
  .object({
    apiVersion: z.string(),
    serverVersion: z.string(),
    capabilities: z.array(z.string()),
  })
  .passthrough();

export type HandshakeResult = z.infer<typeof HandshakeResultSchema>;

// GetNode request parameters schema.
export const GetNodeParamsSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export type GetNodeParams = z.infer<typeof GetNodeParamsSchema>;

// GetNodes request parameters schema.
export const GetNodesParamsSchema = z
  .object({
    type: z.string().optional(),
    limit: z.number().int().positive().optional(),
  })
  .passthrough();

export type GetNodesParams = z.infer<typeof GetNodesParamsSchema>;

// GetEdge request parameters schema.
export const GetEdgeParamsSchema = z
  .object({
    id: z.string(),
  })
  .passthrough();

export type GetEdgeParams = z.infer<typeof GetEdgeParamsSchema>;

// GetEdges request parameters schema.
export const GetEdgesParamsSchema = z
  .object({
    type: z.string().optional(),
    source: z.string().optional(),
    target: z.string().optional(),
    direction: z.enum(['in', 'out', 'both']).optional(),
    limit: z.number().int().positive().optional(),
  })
  .passthrough();

export type GetEdgesParams = z.infer<typeof GetEdgesParamsSchema>;

// ExecuteQuery request parameters schema.
export const ExecuteQueryParamsSchema = z
  .object({
    steps: z.array(z.unknown()).optional(),
    query: z.string().optional(),
  })
  .passthrough();

export type ExecuteQueryParams = z.infer<typeof ExecuteQueryParamsSchema>;

// CreateNode request parameters schema.
export const CreateNodeParamsSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(),
    properties: z.record(z.string(), z.unknown()),
    expectedSequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type CreateNodeParams = z.infer<typeof CreateNodeParamsSchema>;

// UpdateNodeProperties request parameters schema.
export const UpdateNodePropertiesParamsSchema = z
  .object({
    id: z.string(),
    properties: z.record(z.string(), z.unknown()),
    expectedSequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type UpdateNodePropertiesParams = z.infer<typeof UpdateNodePropertiesParamsSchema>;

// DeleteNode request parameters schema.
export const DeleteNodeParamsSchema = z
  .object({
    id: z.string(),
    expectedSequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type DeleteNodeParams = z.infer<typeof DeleteNodeParamsSchema>;

// CreateEdge request parameters schema.
export const CreateEdgeParamsSchema = z
  .object({
    id: z.string().optional(),
    type: z.string(),
    source: z.string(),
    target: z.string(),
    properties: z.record(z.string(), z.unknown()).optional(),
    expectedSequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type CreateEdgeParams = z.infer<typeof CreateEdgeParamsSchema>;

// DeleteEdge request parameters schema.
export const DeleteEdgeParamsSchema = z
  .object({
    id: z.string(),
    expectedSequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type DeleteEdgeParams = z.infer<typeof DeleteEdgeParamsSchema>;

// EventStream subscribe request parameters schema.
export const SubscribeParamsSchema = z
  .object({
    graphId: z.string().optional(),
    fromSequence: z.number().int().nonnegative().optional(),
  })
  .passthrough();

export type SubscribeParams = z.infer<typeof SubscribeParamsSchema>;

// EventStream subscribe result payload schema.
export const SubscribeResultSchema = z
  .object({
    subscriptionId: z.string(),
  })
  .passthrough();

export type SubscribeResult = z.infer<typeof SubscribeResultSchema>;

// EventStream unsubscribe request parameters schema.
export const UnsubscribeParamsSchema = z
  .object({
    subscriptionId: z.string(),
  })
  .passthrough();

export type UnsubscribeParams = z.infer<typeof UnsubscribeParamsSchema>;

// EventStream unsubscribe result payload schema.
export const UnsubscribeResultSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type UnsubscribeResult = z.infer<typeof UnsubscribeResultSchema>;

// EventStream notification parameters schema emitted from server.
export const EventNotificationParamsSchema = z
  .object({
    subscriptionId: z.string(),
    event: z.record(z.string(), z.unknown()),
  })
  .passthrough();

export type EventNotificationParams = z.infer<typeof EventNotificationParamsSchema>;

// Draft create request parameters schema (no fields required beyond the envelope).
export const DraftCreateParamsSchema = z.object({}).passthrough();

export type DraftCreateParams = z.infer<typeof DraftCreateParamsSchema>;

// Draft create result payload schema.
export const DraftCreateResultSchema = z
  .object({
    draftId: z.string(),
    parentRevision: z.string(),
  })
  .passthrough();

export type DraftCreateResult = z.infer<typeof DraftCreateResultSchema>;

// Draft apply request parameters schema; events are validated against the canonical GraphEvent union.
export const DraftApplyParamsSchema = z
  .object({
    draftId: z.string(),
    events: z.array(GraphEventSchema),
  })
  .passthrough();

export type DraftApplyParams = z.infer<typeof DraftApplyParamsSchema>;

// Draft apply result payload schema.
export const DraftApplyResultSchema = z
  .object({
    staged: z.number().int().nonnegative(),
  })
  .passthrough();

export type DraftApplyResult = z.infer<typeof DraftApplyResultSchema>;

// Draft preview request parameters schema.
export const DraftPreviewParamsSchema = z
  .object({
    draftId: z.string(),
  })
  .passthrough();

export type DraftPreviewParams = z.infer<typeof DraftPreviewParamsSchema>;

// Draft preview result payload schema: a bounded diff summary, never the full projected graph.
export const DraftPreviewResultSchema = z
  .object({
    parentRevision: z.string(),
    counts: z
      .object({
        created: z.number().int().nonnegative(),
        updated: z.number().int().nonnegative(),
        deleted: z.number().int().nonnegative(),
      })
      .passthrough(),
    touchedNodeIds: z.array(z.string()),
    touchedEdgeIds: z.array(z.string()),
    truncated: z.boolean(),
  })
  .passthrough();

export type DraftPreviewResult = z.infer<typeof DraftPreviewResultSchema>;

// Draft commit request parameters schema.
export const DraftCommitParamsSchema = z
  .object({
    draftId: z.string(),
    expectedParentRevision: z.string(),
  })
  .passthrough();

export type DraftCommitParams = z.infer<typeof DraftCommitParamsSchema>;

// Draft discard request parameters schema.
export const DraftDiscardParamsSchema = z
  .object({
    draftId: z.string(),
  })
  .passthrough();

export type DraftDiscardParams = z.infer<typeof DraftDiscardParamsSchema>;
