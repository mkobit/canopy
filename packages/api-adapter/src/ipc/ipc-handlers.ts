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
  SubscribeParamsSchema,
  UnsubscribeParamsSchema,
  UpdateNodePropertiesParamsSchema,
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
    const rawObj: unknown = JSON.parse(line);
    if (typeof rawObj === 'object' && rawObj !== null && 'id' in rawObj) {
      currentId = (rawObj as Readonly<{ id?: JsonRpcId }>).id;
    }

    const parseResult = JsonRpcRequestSchema.safeParse(rawObj);
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

    const req: JsonRpcRequest = parseResult.data;
    const reqId = req.id ?? null;
    currentId = reqId;

    switch (req.method) {
      case IPC_METHODS.HANDSHAKE: {
        const paramsResult = HandshakeParametersSchema.safeParse(req.params ?? {});
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid handshake parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const handshakeResult: HandshakeResult = {
          apiVersion: 'v1',
          serverVersion: '0.1.0',
          capabilities: ['queries', 'mutations', 'subscriptions'],
        };
        return ok({ response: makeSuccessResponse(reqId, handshakeResult) });
      }

      case IPC_METHODS.QUERY_GET_NODE: {
        const parametersResult = GetNodeParametersSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getNode parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = executeNodeQuery(
          createApiRequest('ipc-get-node', context, { id: asNodeId(parametersResult.data.id) }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        const node = res.value[0];
        if (!node) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `Node not found: ${parametersResult.data.id}`,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, node) });
      }

      case IPC_METHODS.QUERY_GET_NODES: {
        const parametersResult = GetNodesParametersSchema.safeParse(req.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getNodes parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = executeNodeQuery(
          createApiRequest('ipc-get-nodes', context, {
            type: parametersResult.data.type ? asTypeId(parametersResult.data.type) : undefined,
            limit: parametersResult.data.limit,
          }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.QUERY_GET_EDGE: {
        const parametersResult = GetEdgeParametersSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getEdge parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = executeEdgeQuery(
          createApiRequest('ipc-get-edge', context, { id: asEdgeId(parametersResult.data.id) }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        const edge = res.value[0];
        if (!edge) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              `Edge not found: ${parametersResult.data.id}`,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, edge) });
      }

      case IPC_METHODS.QUERY_GET_EDGES: {
        const parametersResult = GetEdgesParametersSchema.safeParse(req.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getEdges parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = executeEdgeQuery(
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
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.QUERY_EXECUTE_QUERY: {
        const parametersResult = ExecuteQueryParametersSchema.safeParse(req.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid executeQuery parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = executeNodeQuery(
          createApiRequest('ipc-execute-query', context, {
            type: undefined,
            limit: undefined,
          }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.MUTATION_CREATE_NODE: {
        const parametersResult = CreateNodeParametersSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid createNode parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = await executeCreateNode(
          createApiRequest('ipc-create-node', context, {
            ...(parametersResult.data.id && { id: asNodeId(parametersResult.data.id) }),
            type: asTypeId(parametersResult.data.type),
            properties: parametersResult.data.properties as Readonly<Record<string, PropertyValue>>,
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.MUTATION_UPDATE_NODE_PROPERTIES: {
        const parametersResult = UpdateNodePropertiesParamsSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid updateNodeProperties parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = await executeUpdateNodeProperties(
          createApiRequest('ipc-update-node-properties', context, {
            id: asNodeId(parametersResult.data.id),
            properties: parametersResult.data.properties as Readonly<Record<string, PropertyValue>>,
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.MUTATION_DELETE_NODE: {
        const parametersResult = DeleteNodeParametersSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid deleteNode parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = await executeDeleteNode(
          createApiRequest('ipc-delete-node', context, {
            id: asNodeId(parametersResult.data.id),
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.MUTATION_CREATE_EDGE: {
        const parametersResult = CreateEdgeParametersSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid createEdge parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = await executeCreateEdge(
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
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.MUTATION_DELETE_EDGE: {
        const parametersResult = DeleteEdgeParametersSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid deleteEdge parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const res = await executeDeleteEdge(
          createApiRequest('ipc-delete-edge', context, {
            id: asEdgeId(parametersResult.data.id),
            ...(parametersResult.data.expectedSequence !== undefined && {
              expectedSequence: parametersResult.data.expectedSequence,
            }),
          }),
        );
        if (!res.ok) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.CANOPY_DOMAIN_ERROR,
              res.error.message,
              res.error,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, res.value) });
      }

      case IPC_METHODS.EVENT_STREAM_SUBSCRIBE: {
        const parametersResult = SubscribeParamsSchema.safeParse(req.params ?? {});
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
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
          response: makeSuccessResponse(reqId, subscribeResult),
          newSubscription: {
            subscriptionId,
            close: () => {
              subscriber.close();
            },
          },
        });
      }

      case IPC_METHODS.EVENT_STREAM_UNSUBSCRIBE: {
        const parametersResult = UnsubscribeParamsSchema.safeParse(req.params);
        if (!parametersResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid unsubscribe parameters',
              parametersResult.error.format(),
            ),
          });
        }
        const unsubscribeResult: UnsubscribeResult = { success: true };
        return ok({
          response: makeSuccessResponse(reqId, unsubscribeResult),
          unsubscribeId: parametersResult.data.subscriptionId,
        });
      }

      default: {
        return ok({
          response: makeErrorResponse(
            reqId,
            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
            `Method not found: ${req.method}`,
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
