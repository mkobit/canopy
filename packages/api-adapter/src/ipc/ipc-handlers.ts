/* eslint-disable functional/no-return-void, max-lines-per-function, functional/prefer-immutable-types */
import type { PropertyValue, Result } from '@canopy/graph';
import { asEdgeId, asNodeId, asTypeId, ok } from '@canopy/graph';
import type { ApiAdapterContext } from '../api-context';
import { createApiRequest } from '../api-payloads';
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

export type IpcHandlerResponse = Readonly<{
  response?: JsonRpcResponse | undefined;
  newSubscription?:
    | Readonly<{
        subscriptionId: string;
        close: () => void;
      }>
    | undefined;
  unsubscribeId?: string | undefined;
}>;

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
export const handleIpcRequestLine = async (
  line: string,
  context: ApiAdapterContext,
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
          capabilities: ['queries', 'mutations', 'subscriptions'],
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
            close: () => {
              subscriber.close();
            },
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
