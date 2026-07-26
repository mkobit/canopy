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
  CreateEdgeParamsSchema,
  CreateNodeParamsSchema,
  DeleteEdgeParamsSchema,
  DeleteNodeParamsSchema,
  ExecuteQueryParamsSchema,
  GetEdgeParamsSchema,
  GetEdgesParamsSchema,
  GetNodeParamsSchema,
  GetNodesParamsSchema,
  HandshakeParamsSchema,
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
        const paramsResult = HandshakeParamsSchema.safeParse(req.params ?? {});
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
        const paramsResult = GetNodeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getNode parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = executeNodeQuery(
          createApiRequest('ipc-get-node', context, { id: asNodeId(paramsResult.data.id) }),
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
              `Node not found: ${paramsResult.data.id}`,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, node) });
      }

      case IPC_METHODS.QUERY_GET_NODES: {
        const paramsResult = GetNodesParamsSchema.safeParse(req.params ?? {});
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getNodes parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = executeNodeQuery(
          createApiRequest('ipc-get-nodes', context, {
            type: paramsResult.data.type ? asTypeId(paramsResult.data.type) : undefined,
            limit: paramsResult.data.limit,
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
        const paramsResult = GetEdgeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getEdge parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = executeEdgeQuery(
          createApiRequest('ipc-get-edge', context, { id: asEdgeId(paramsResult.data.id) }),
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
              `Edge not found: ${paramsResult.data.id}`,
            ),
          });
        }
        return ok({ response: makeSuccessResponse(reqId, edge) });
      }

      case IPC_METHODS.QUERY_GET_EDGES: {
        const paramsResult = GetEdgesParamsSchema.safeParse(req.params ?? {});
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid getEdges parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = executeEdgeQuery(
          createApiRequest('ipc-get-edges', context, {
            type: paramsResult.data.type ? asTypeId(paramsResult.data.type) : undefined,
            source: paramsResult.data.source ? asNodeId(paramsResult.data.source) : undefined,
            target: paramsResult.data.target ? asNodeId(paramsResult.data.target) : undefined,
            direction: paramsResult.data.direction,
            limit: paramsResult.data.limit,
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
        const paramsResult = ExecuteQueryParamsSchema.safeParse(req.params ?? {});
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid executeQuery parameters',
              paramsResult.error.format(),
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
        const paramsResult = CreateNodeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid createNode parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = await executeCreateNode(
          createApiRequest('ipc-create-node', context, {
            ...(paramsResult.data.id && { id: asNodeId(paramsResult.data.id) }),
            type: asTypeId(paramsResult.data.type),
            properties: paramsResult.data.properties as Readonly<Record<string, PropertyValue>>,
            ...(paramsResult.data.expectedSequence !== undefined && {
              expectedSequence: paramsResult.data.expectedSequence,
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
        const paramsResult = UpdateNodePropertiesParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid updateNodeProperties parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = await executeUpdateNodeProperties(
          createApiRequest('ipc-update-node-properties', context, {
            id: asNodeId(paramsResult.data.id),
            properties: paramsResult.data.properties as Readonly<Record<string, PropertyValue>>,
            ...(paramsResult.data.expectedSequence !== undefined && {
              expectedSequence: paramsResult.data.expectedSequence,
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
        const paramsResult = DeleteNodeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid deleteNode parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = await executeDeleteNode(
          createApiRequest('ipc-delete-node', context, {
            id: asNodeId(paramsResult.data.id),
            ...(paramsResult.data.expectedSequence !== undefined && {
              expectedSequence: paramsResult.data.expectedSequence,
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
        const paramsResult = CreateEdgeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid createEdge parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = await executeCreateEdge(
          createApiRequest('ipc-create-edge', context, {
            ...(paramsResult.data.id && { id: asEdgeId(paramsResult.data.id) }),
            type: asTypeId(paramsResult.data.type),
            source: asNodeId(paramsResult.data.source),
            target: asNodeId(paramsResult.data.target),
            properties: (paramsResult.data.properties ?? {}) as Readonly<
              Record<string, PropertyValue>
            >,
            ...(paramsResult.data.expectedSequence !== undefined && {
              expectedSequence: paramsResult.data.expectedSequence,
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
        const paramsResult = DeleteEdgeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid deleteEdge parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const res = await executeDeleteEdge(
          createApiRequest('ipc-delete-edge', context, {
            id: asEdgeId(paramsResult.data.id),
            ...(paramsResult.data.expectedSequence !== undefined && {
              expectedSequence: paramsResult.data.expectedSequence,
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
        const paramsResult = SubscribeParamsSchema.safeParse(req.params ?? {});
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid subscribe parameters',
              paramsResult.error.format(),
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
        const paramsResult = UnsubscribeParamsSchema.safeParse(req.params);
        if (!paramsResult.success) {
          return ok({
            response: makeErrorResponse(
              reqId,
              JSON_RPC_ERROR_CODES.INVALID_PARAMS,
              'Invalid unsubscribe parameters',
              paramsResult.error.format(),
            ),
          });
        }
        const unsubscribeResult: UnsubscribeResult = { success: true };
        return ok({
          response: makeSuccessResponse(reqId, unsubscribeResult),
          unsubscribeId: paramsResult.data.subscriptionId,
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
